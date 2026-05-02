import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY!;
const BASE = "https://api.congress.gov/v3";

async function zipToState(zip: string): Promise<{ stateCode: string; stateName: string } | null> {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return null;
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;
  return {
    stateCode: place["state abbreviation"],
    stateName: place["state"],
  };
}

interface RepDTO {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  office: string;
  photoUrl: string | null;
  websiteUrl: string | null;
  phone: string | null;
  officeAddress: string | null;
}

async function readFromDb(stateCode: string): Promise<RepDTO[]> {
  const terms = await prisma.term.findMany({
    where: { state: stateCode, endYear: null },
    include: { member: true },
  });

  return terms.map((t) => {
    const districtLabel = t.chamber === "Senate" || !t.district ? "" : ` — District ${t.district}`;
    return {
      bioguideId: t.bioguideId,
      name: t.member.name,
      party: t.party,
      chamber: t.chamber,
      office: `${t.stateName} · ${t.chamber}${districtLabel}`,
      photoUrl: t.member.photoUrl,
      websiteUrl: t.member.websiteUrl,
      phone: t.member.phone,
      officeAddress: t.member.officeAddress,
    };
  });
}

interface CongressMemberLive {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item?: Array<{ chamber: string; startYear: number }> };
}

async function liveFallback(stateCode: string, stateName: string): Promise<RepDTO[]> {
  // Used only when DB has nothing for this state (e.g. before first sync).
  // Mirrors the previous behavior but fixes the dual-chamber duplicate bug.
  const res = await fetch(
    `${BASE}/member/${stateCode}?currentMember=true&limit=50&api_key=${CONGRESS_API_KEY}&format=json`
  );
  if (!res.ok) return [];
  const data = await res.json();
  const members: CongressMemberLive[] = data.members ?? [];

  return members
    .map((m): RepDTO | null => {
      const latest = [...(m.terms?.item ?? [])].sort(
        (a, b) => (b.startYear ?? 0) - (a.startYear ?? 0)
      )[0];
      if (!latest) return null;
      const chamber =
        latest.chamber.toLowerCase().includes("senate")
          ? "Senate"
          : "House of Representatives";
      const districtLabel =
        chamber === "Senate" || !m.district ? "" : ` — District ${m.district}`;
      return {
        bioguideId: m.bioguideId,
        name: m.name,
        party: m.partyName ?? "Unknown",
        chamber,
        office: `${stateName} · ${chamber}${districtLabel}`,
        photoUrl: m.depiction?.imageUrl ?? null,
        websiteUrl: null,
        phone: null,
        officeAddress: null,
      };
    })
    .filter((r): r is RepDTO => r !== null);
}

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || zip.length !== 5) {
    return NextResponse.json({ error: "Valid 5-digit ZIP required" }, { status: 400 });
  }

  const location = await zipToState(zip);
  if (!location) {
    return NextResponse.json({ error: "Could not resolve ZIP code to a state." }, { status: 404 });
  }

  const { stateCode, stateName } = location;

  let reps = await readFromDb(stateCode);
  if (reps.length === 0) {
    reps = await liveFallback(stateCode, stateName);
  }

  reps.sort((a, b) => {
    if (a.chamber === "Senate" && b.chamber !== "Senate") return -1;
    if (b.chamber === "Senate" && a.chamber !== "Senate") return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ reps, stateName, stateCode });
}
