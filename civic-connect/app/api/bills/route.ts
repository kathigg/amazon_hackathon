import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BillFeedSort, getBillsBySort } from "@/lib/bill-feed";
import { searchBills, countSearchBills } from "@/lib/bill-search";
import { filterPredicateForTopic } from "@/lib/taxonomy";
import { withTimeout } from "@/lib/with-timeout";

const BILLS_API_TIMEOUT_MS = 2_500;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q")?.trim() || undefined;
  const topic = searchParams.get("topic") ?? undefined;
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 12);
  const sort = normalizeSort(searchParams.get("sort") ?? undefined);
  const skip = (page - 1) * limit;

  const [bills, total] = await withTimeout(
    () =>
      q
        ? Promise.all([
            searchBills({ q, topic, take: limit, skip }),
            countSearchBills({ q, topic }),
          ])
        : (() => {
            const where = topic
              ? { topicTags: { hasSome: filterPredicateForTopic(topic) } }
              : {};
            return Promise.all([
              getBillsBySort({ where, sort, take: limit, skip }),
              prisma.bill.count({ where }),
            ]);
          })(),
    BILLS_API_TIMEOUT_MS,
    [[], 0] as const
  );

  return NextResponse.json(
    { bills, total, page, pages: Math.ceil(total / limit) },
    {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}

function normalizeSort(sort?: string): BillFeedSort {
  return sort === "hot" ? "hot" : "latest";
}
