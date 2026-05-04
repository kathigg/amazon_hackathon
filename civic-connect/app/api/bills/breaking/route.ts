import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getBreakingCutoff,
  getBreakingExpiresAt,
  getBreakingKey,
} from "@/lib/breaking-bills";
import { formatTerm } from "@/lib/taxonomy";

export const dynamic = "force-dynamic";

export async function GET() {
  const bill = await prisma.bill.findFirst({
    where: {
      breakingAt: {
        gte: getBreakingCutoff(),
      },
    },
    orderBy: {
      breakingAt: "desc",
    },
    include: {
      summary: true,
    },
  });

  if (!bill?.breakingAt) {
    return NextResponse.json({ bill: null }, { headers: noStoreHeaders() });
  }

  return NextResponse.json(
    {
      bill: {
        id: bill.id,
        title: bill.title,
        status: bill.status,
        topic: bill.topicTags[0] ? formatTerm(bill.topicTags[0]) : "General",
        summary: bill.summary?.plainLanguage ?? null,
        breakingAt: bill.breakingAt.toISOString(),
        expiresAt: getBreakingExpiresAt(bill.breakingAt).toISOString(),
        key: getBreakingKey(bill.id, bill.breakingAt),
      },
    },
    { headers: noStoreHeaders() }
  );
}

function noStoreHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
  };
}
