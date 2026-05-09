import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  billCardSelect,
  type BillWithSummary,
} from "@/lib/bill-feed";
import { getBillImageRecord } from "@/lib/bill-image-categories";
import { filterPredicateForTopic } from "@/lib/taxonomy";
import { parseBillId } from "@/lib/bill-id";

interface SearchArgs {
  q: string;
  topic?: string;
  take: number;
  skip?: number;
}

interface CountArgs {
  q: string;
  topic?: string;
}

export async function searchBills({
  q,
  topic,
  take,
  skip = 0,
}: SearchArgs): Promise<BillWithSummary[]> {
  const candidateIds = parseBillId(q);
  const ranked = await rankedSearchIds({ q, topic, candidateIds, take, skip });
  if (ranked.length === 0) return [];

  const bills = await prisma.bill.findMany({
    where: { id: { in: ranked } },
    select: billCardSelect,
  });

  const ordered = ranked
    .map((id) => bills.find((bill) => bill.id === id))
    .filter((bill): bill is BillWithSummary => Boolean(bill));

  return ordered.map((bill) => ({
    ...bill,
    imageUrl: getBillImageRecord(bill.id, bill.topicTags).imageUrl,
  }));
}

export async function countSearchBills({ q, topic }: CountArgs): Promise<number> {
  const candidateIds = parseBillId(q);
  const idMatch =
    candidateIds.length > 0
      ? Prisma.sql`"id" = ANY(${candidateIds}::text[])`
      : Prisma.sql`FALSE`;
  const topicClause = topicFilterClause(topic);

  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "Bill"
    WHERE (${idMatch} OR "search_vector" @@ plainto_tsquery('english', ${q}))
      ${topicClause}
  `;

  return Number(rows[0]?.count ?? BigInt(0));
}

async function rankedSearchIds({
  q,
  topic,
  candidateIds,
  take,
  skip,
}: {
  q: string;
  topic?: string;
  candidateIds: string[];
  take: number;
  skip: number;
}): Promise<string[]> {
  const idMatch =
    candidateIds.length > 0
      ? Prisma.sql`"id" = ANY(${candidateIds}::text[])`
      : Prisma.sql`FALSE`;
  const topicClause = topicFilterClause(topic);

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "Bill"
    WHERE (${idMatch} OR "search_vector" @@ plainto_tsquery('english', ${q}))
      ${topicClause}
    ORDER BY
      (${idMatch}) DESC,
      ts_rank_cd("search_vector", plainto_tsquery('english', ${q})) DESC,
      "introducedAt" DESC
    LIMIT ${take} OFFSET ${skip}
  `;

  return rows.map((row) => row.id);
}

function topicFilterClause(topic: string | undefined): Prisma.Sql {
  if (!topic) return Prisma.empty;
  const terms = filterPredicateForTopic(topic);
  if (terms.length === 0) return Prisma.empty;
  return Prisma.sql`AND "topicTags" && ${terms}::text[]`;
}
