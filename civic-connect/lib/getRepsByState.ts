import { prisma } from "./prisma";

const PARTY_FULL: Record<string, string> = {
  D: "Democratic",
  R: "Republican",
  I: "Independent",
};

const CHAMBER_FULL: Record<string, string> = {
  senate: "Senate",
  house: "House of Representatives",
};

export interface RepSummary {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  state: string;
  office: string;
  photoUrl?: string;
  websiteUrl?: string;
  phone?: string;
  officeAddress?: string;
}

export async function getRepsByStateName(stateName: string): Promise<RepSummary[]> {
  const dbReps = await prisma.representative.findMany({
    where: { state: stateName },
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
      state: r.state,
      office: `${stateName} · ${chamber}${districtLabel}`,
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
}
