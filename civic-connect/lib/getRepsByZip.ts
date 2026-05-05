import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import type { RepSummary } from "./getRepsByState";
import { stateCodeToName } from "./us-states";

const PARTY_FULL: Record<string, string> = {
  D: "Democratic",
  R: "Republican",
  I: "Independent",
};

const CHAMBER_FULL: Record<string, string> = {
  senate: "Senate",
  house: "House of Representatives",
};

/**
 * Look up Senators (state-wide) + the matching House rep(s) for a ZIP.
 * Returns [] if the ZIP isn't in ZipDistrict — the caller should fall back to
 * a state-level lookup.
 *
 * For ZCTAs that straddle district lines, multiple House reps may be returned.
 */
const getCachedRepsByZip = unstable_cache(
  async (zip: string): Promise<RepSummary[]> => {
  const matches = await prisma.zipDistrict.findMany({
    where: { zip },
    select: { stateCode: true, stateName: true, district: true },
  });
  if (matches.length === 0) return [];

  const stateVariants = Array.from(
    new Set(matches.flatMap((match) => [match.stateCode, match.stateName]))
  );
  const districts = Array.from(new Set(matches.map((match) => match.district)));

  const dbReps = await prisma.representative.findMany({
    where: {
      OR: [
        {
          chamber: "senate",
          state: { in: stateVariants },
        },
        ...districts.flatMap((district) =>
          stateVariants.map((state) => ({
            chamber: "house",
            state,
            district,
          }))
        ),
      ],
    },
    orderBy: [{ chamber: "asc" }, { lastName: "asc" }],
  });

  const reps: RepSummary[] = dbReps.map((r) => {
    const chamber = CHAMBER_FULL[r.chamber] ?? r.chamber;
    const party = PARTY_FULL[r.party] ?? "Unknown";
    const districtLabel =
      r.district && r.district !== "0" ? ` — District ${r.district}` : "";
    return {
      bioguideId: r.bioguideId,
      name: `${r.firstName} ${r.lastName}`.trim(),
      party,
      chamber,
      state: stateCodeToName(r.state) ?? r.state,
      office: `${stateCodeToName(r.state) ?? r.state} · ${chamber}${districtLabel}`,
      photoUrl: r.photoUrl ?? undefined,
      websiteUrl: r.websiteUrl ?? undefined,
      phone: r.phone ?? undefined,
      officeAddress: r.officeAddress ?? undefined,
    };
  });

  reps.sort((a, b) => {
    if (a.chamber === "Senate" && b.chamber !== "Senate") return -1;
    if (b.chamber === "Senate" && a.chamber !== "Senate") return 1;
    return a.name.localeCompare(b.name);
  });

  return reps;
  },
  ["reps-by-zip"],
  { revalidate: 3_600 }
);

export async function getRepsByZip(zip: string): Promise<RepSummary[]> {
  return getCachedRepsByZip(zip.trim());
}
