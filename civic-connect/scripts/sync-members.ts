/**
 * Sync current members of Congress from Congress.gov into local DB.
 *
 * Run with: npm run sync:members
 *   or:     tsx scripts/sync-members.ts [--full]
 *
 * Default mode (cheap): 3 paginated calls to /v3/member?currentMember=true.
 *   Uses only list-payload data — no per-member detail calls.
 *   Skips phone/address/website (not in list payload).
 *
 * --full mode: same 3 list calls + one /v3/member/{bioguideId} per *new* member
 *   (or any member older than DETAIL_MAX_AGE_DAYS) to backfill phone/address/website.
 *
 * Term storage: full history for every currently-serving member is preserved.
 * Each term row is keyed by (bioguideId, chamber, startYear) and upserted —
 * new terms (chamber transitions) get created, mutable fields on existing terms
 * (endYear closing out, party switches, redistricting) get updated. Terms are
 * never deleted while the member is current.
 *
 * Reconcile: when a member drops out of currentMember=true (resigned, retired,
 * lost election, deceased), the Member row is removed and Terms cascade-delete.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";

const BASE = "https://api.congress.gov/v3";
const PAGE_SIZE = 250;
const DETAIL_MAX_AGE_DAYS = 7;

function getKey() {
  const k = process.env.CONGRESS_API_KEY;
  if (!k) throw new Error("CONGRESS_API_KEY is not set");
  return k;
}

interface ListedTerm {
  chamber?: string;
  startYear?: number;
  endYear?: number;
  congress?: number;
  stateCode?: string;
  stateName?: string;
  district?: number;
  partyName?: string;
}

interface ListedMember {
  bioguideId: string;
  name?: string;
  partyName?: string;
  state?: string;
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item?: ListedTerm[] };
}

interface MemberDetail {
  directOrderName?: string;
  officialWebsiteUrl?: string;
  addressInformation?: { phoneNumber?: string; officeAddress?: string };
  depiction?: { imageUrl?: string };
  partyHistory?: Array<{ partyName: string }>;
  terms?: { item?: ListedTerm[] };
}

async function fetchPage(offset: number): Promise<ListedMember[]> {
  const url = `${BASE}/member?currentMember=true&limit=${PAGE_SIZE}&offset=${offset}&api_key=${getKey()}&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`List fetch failed (offset=${offset}): ${res.status}`);
  const data = await res.json();
  return data.members ?? [];
}

async function fetchAllListed(): Promise<ListedMember[]> {
  const all: ListedMember[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await fetchPage(offset);
    if (page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return all;
}

async function fetchDetail(bioguideId: string): Promise<MemberDetail | null> {
  const url = `${BASE}/member/${bioguideId}?api_key=${getKey()}&format=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.member ?? null;
}

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "District of Columbia", PR: "Puerto Rico", VI: "U.S. Virgin Islands",
  GU: "Guam", AS: "American Samoa", MP: "Northern Mariana Islands",
};

function flipName(name?: string): string {
  // Congress.gov list returns "Last, First" — flip to "First Last"
  if (!name) return "Unknown";
  const idx = name.indexOf(",");
  if (idx === -1) return name.trim();
  const last = name.slice(0, idx).trim();
  const rest = name.slice(idx + 1).trim();
  return `${rest} ${last}`.trim();
}

function normalizeChamber(raw?: string): string | null {
  if (!raw) return null;
  if (raw.toLowerCase().includes("senate")) return "Senate";
  if (raw.toLowerCase().includes("house")) return "House of Representatives";
  return null;
}

function pickState(member: ListedMember, term: ListedTerm): { code: string; name: string } | null {
  const code = (term.stateCode ?? member.state ?? "").toUpperCase();
  if (!code) return null;
  // member.state is a full name on the list endpoint, not a code — handle that case
  if (code.length > 2) {
    const entry = Object.entries(STATE_NAMES).find(([, n]) => n.toUpperCase() === code);
    if (entry) return { code: entry[0], name: entry[1] };
    return null;
  }
  return { code, name: term.stateName ?? STATE_NAMES[code] ?? code };
}

interface SyncStats {
  membersUpserted: number;
  termsCreated: number;
  termsUpdated: number;
  detailFetches: number;
  removed: number;
}

async function main() {
  const fullMode = process.argv.includes("--full");
  console.log(`Syncing members (mode: ${fullMode ? "full" : "list-only"})...`);

  const listed = await fetchAllListed();
  console.log(`  Fetched ${listed.length} current members in ${Math.ceil(listed.length / PAGE_SIZE)} list calls`);

  const stats: SyncStats = {
    membersUpserted: 0,
    termsCreated: 0,
    termsUpdated: 0,
    detailFetches: 0,
    removed: 0,
  };
  const seen = new Set<string>();

  for (const m of listed) {
    if (!m.bioguideId) continue;
    seen.add(m.bioguideId);

    const allTerms = (m.terms?.item ?? []).filter((t) => t.startYear != null);
    if (allTerms.length === 0) continue;

    const existing = await prisma.member.findUnique({ where: { bioguideId: m.bioguideId } });
    const stale =
      !existing ||
      Date.now() - existing.syncedAt.getTime() > DETAIL_MAX_AGE_DAYS * 86400_000;

    let detail: MemberDetail | null = null;
    if (fullMode && stale) {
      detail = await fetchDetail(m.bioguideId);
      stats.detailFetches++;
    }

    const name = detail?.directOrderName ?? flipName(m.name);
    const photoUrl = detail?.depiction?.imageUrl ?? m.depiction?.imageUrl ?? null;
    const websiteUrl = detail?.officialWebsiteUrl ?? null;
    const phone = detail?.addressInformation?.phoneNumber ?? null;
    const officeAddress = detail?.addressInformation?.officeAddress ?? null;

    await prisma.member.upsert({
      where: { bioguideId: m.bioguideId },
      update: {
        name,
        ...(photoUrl !== null && { photoUrl }),
        ...(websiteUrl !== null && { websiteUrl }),
        ...(phone !== null && { phone }),
        ...(officeAddress !== null && { officeAddress }),
      },
      create: {
        bioguideId: m.bioguideId,
        name,
        photoUrl,
        websiteUrl,
        phone,
        officeAddress,
      },
    });
    stats.membersUpserted++;

    // Upsert each term by (bioguideId, chamber, startYear).
    // Adds new terms (chamber transitions) and updates mutable fields on existing
    // terms (endYear closing out, party switches, redistricting). Never deletes.
    for (const t of allTerms) {
      const chamber = normalizeChamber(t.chamber);
      if (!chamber) continue;
      const stateInfo = pickState(m, t);
      if (!stateInfo) continue;

      const startYear = t.startYear!;
      const district = chamber === "Senate" ? null : t.district ?? m.district ?? null;
      const party = t.partyName ?? m.partyName ?? "Unknown";

      const existingTerm = await prisma.term.findUnique({
        where: {
          bioguideId_chamber_startYear: {
            bioguideId: m.bioguideId,
            chamber,
            startYear,
          },
        },
      });

      if (existingTerm) {
        await prisma.term.update({
          where: { id: existingTerm.id },
          data: {
            state: stateInfo.code,
            stateName: stateInfo.name,
            district,
            party,
            congress: t.congress ?? existingTerm.congress,
            endYear: t.endYear ?? existingTerm.endYear,
          },
        });
        stats.termsUpdated++;
      } else {
        await prisma.term.create({
          data: {
            bioguideId: m.bioguideId,
            chamber,
            state: stateInfo.code,
            stateName: stateInfo.name,
            district,
            party,
            congress: t.congress ?? null,
            startYear,
            endYear: t.endYear ?? null,
          },
        });
        stats.termsCreated++;
      }
    }
  }

  // Reconcile: remove members no longer current
  const toRemove = await prisma.member.findMany({
    where: { bioguideId: { notIn: Array.from(seen) } },
    select: { bioguideId: true },
  });
  if (toRemove.length > 0) {
    await prisma.member.deleteMany({
      where: { bioguideId: { in: toRemove.map((r) => r.bioguideId) } },
    });
    stats.removed = toRemove.length;
  }

  console.log("Done.");
  console.log(`  Members upserted: ${stats.membersUpserted}`);
  console.log(`  Terms created:    ${stats.termsCreated}`);
  console.log(`  Terms updated:    ${stats.termsUpdated}`);
  console.log(`  Detail fetches:   ${stats.detailFetches}`);
  console.log(`  Removed (no longer current): ${stats.removed}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
