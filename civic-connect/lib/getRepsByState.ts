import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { stateCodeToName, US_STATE_CODE_TO_NAME } from "./us-states";

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

function getStateVariants(stateValue: string) {
  const trimmed = stateValue.trim();
  const normalizedCode =
    trimmed.length === 2 ? trimmed.toUpperCase() : null;
  const normalizedName =
    normalizedCode
      ? stateCodeToName(normalizedCode)
      : Object.entries(US_STATE_CODE_TO_NAME).find(
          ([, name]) => name.toLowerCase() === trimmed.toLowerCase()
        )?.[1] ?? trimmed;

  return Array.from(
    new Set([normalizedCode, normalizedName].filter(Boolean) as string[])
  );
}

const getCachedRepsByStateName = unstable_cache(
  async (stateName: string): Promise<RepSummary[]> => {
    const stateVariants = getStateVariants(stateName);
    const dbReps = await prisma.representative.findMany({
      where: {
        state: {
          in: stateVariants,
        },
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
  ["reps-by-state"],
  { revalidate: 3_600 }
);

export async function getRepsByStateName(stateName: string): Promise<RepSummary[]> {
  return getCachedRepsByStateName(stateName.trim());
}
