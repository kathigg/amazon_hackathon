import { unstable_cache } from "next/cache";
import { prisma } from "./prisma";
import { type ChamberFocus } from "./legislative";

export type PositionStance =
  | "strong_support"
  | "possible_support"
  | "neutral"
  | "possible_reject"
  | "strong_reject";

export interface BillRepresentativePosition {
  repId: string;
  bioguideId: string;
  name: string;
  firstName: string;
  lastName: string;
  party: string;
  chamber: "house" | "senate";
  state: string;
  district: string | null;
  websiteUrl: string | null;
  stance: PositionStance;
  confidence: number;
  reasoning: string | null;
  source: string | null;
  isPreferred: boolean;
}

const STANCE_PRIORITY: Record<PositionStance, number> = {
  strong_support: 4,
  possible_support: 3,
  neutral: 2,
  possible_reject: 1,
  strong_reject: 0,
};

export async function listBillRepresentativePositions({
  billId,
  chamber = "both",
  preferredRepBioguideIds = [],
}: {
  billId: string;
  chamber?: ChamberFocus;
  preferredRepBioguideIds?: string[];
}) {
  const representatives = await getCachedRepresentativePositions(billId, chamber);

  return representatives
    .map((representative) => {
      const stanceRecord = representative.stanceRecord;
      const stance = normalizeStance(
        stanceRecord?.stance,
        stanceRecord?.confidence ?? 0
      );

      return {
        repId: representative.id,
        bioguideId: representative.bioguideId,
        name: `${representative.firstName} ${representative.lastName}`,
        firstName: representative.firstName,
        lastName: representative.lastName,
        party: representative.party,
        chamber: representative.chamber as "house" | "senate",
        state: representative.state,
        district: representative.district,
        websiteUrl: representative.websiteUrl,
        stance,
        confidence: stanceRecord?.confidence ?? 0,
        reasoning: trimReasoning(stanceRecord?.reasoning),
        source: stanceRecord?.source ?? null,
        isPreferred: preferredRepBioguideIds.includes(
          representative.bioguideId
        ),
      } satisfies BillRepresentativePosition;
    })
    .sort((left, right) => {
      if (left.isPreferred !== right.isPreferred) {
        return left.isPreferred ? -1 : 1;
      }

      if (STANCE_PRIORITY[right.stance] !== STANCE_PRIORITY[left.stance]) {
        return STANCE_PRIORITY[right.stance] - STANCE_PRIORITY[left.stance];
      }

      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }

      return left.lastName.localeCompare(right.lastName);
    });
}

const getCachedRepresentativePositions = unstable_cache(
  async (billId: string, chamber: ChamberFocus) => {
    const representatives = await prisma.representative.findMany({
      where:
        chamber === "both"
          ? undefined
          : {
              chamber,
            },
      select: {
        id: true,
        bioguideId: true,
        firstName: true,
        lastName: true,
        party: true,
        chamber: true,
        state: true,
        district: true,
        websiteUrl: true,
        stances: {
          where: {
            billId,
          },
          orderBy: {
            scrapedAt: "desc",
          },
          take: 1,
        },
      },
    });

    return representatives.map((representative) => ({
      ...representative,
      stanceRecord: representative.stances[0] ?? null,
      stances: undefined,
    }));
  },
  ["bill-representative-positions"],
  { revalidate: 900 }
);

export function trimReasoning(reasoning?: string | null) {
  if (!reasoning) {
    return null;
  }

  const normalized = reasoning.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return null;
  }

  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((sentence) =>
    sentence.trim()
  );

  if (!sentences || sentences.length === 0) {
    return normalized.slice(0, 220);
  }

  return sentences.slice(0, 2).join(" ").slice(0, 240);
}

export function getStanceDisplayLabel(stance: PositionStance) {
  switch (stance) {
    case "strong_support":
      return "Strong support";
    case "possible_support":
      return "Likely support";
    case "possible_reject":
      return "Likely oppose";
    case "strong_reject":
      return "Strong opposition";
    default:
      return "No position";
  }
}

export function normalizeStance(
  stance?: string | null,
  confidence = 0
): PositionStance {
  if (!stance || confidence < 0.2) {
    return "neutral";
  }

  if (
    stance === "strong_support" ||
    stance === "possible_support" ||
    stance === "neutral" ||
    stance === "possible_reject" ||
    stance === "strong_reject"
  ) {
    return stance;
  }

  return "neutral";
}
