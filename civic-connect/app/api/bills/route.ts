import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { BillFeedSort, getBillsBySort } from "@/lib/bill-feed";
import { filterPredicateForTopic } from "@/lib/taxonomy";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const topic = searchParams.get("topic") ?? undefined;
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 12);
  const sort = normalizeSort(searchParams.get("sort") ?? undefined);
  const skip = (page - 1) * limit;

  const where = {
    ...(q && { title: { contains: q, mode: "insensitive" as const } }),
    ...(topic && { topicTags: { hasSome: filterPredicateForTopic(topic) } }),
  };

  const [bills, total] = await Promise.all([
    getBillsBySort({
      where,
      sort,
      take: limit,
      skip,
    }),
    prisma.bill.count({ where }),
  ]);

  return NextResponse.json({ bills, total, page, pages: Math.ceil(total / limit) });
}

function normalizeSort(sort?: string): BillFeedSort {
  return sort === "hot" ? "hot" : "latest";
}
