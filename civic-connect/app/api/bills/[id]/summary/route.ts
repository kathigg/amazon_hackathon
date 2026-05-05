import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isSummaryPlaceholder } from "@/lib/bill-summary";

export const maxDuration = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const summary = await prisma.summary.findUnique({
    where: { billId: params.id },
    select: { plainLanguage: true, keyProvisions: true, whyItMatters: true },
  });

  if (summary) {
    const usable =
      !isSummaryPlaceholder(summary.plainLanguage) ||
      summary.keyProvisions.length > 0 ||
      !isSummaryPlaceholder(summary.whyItMatters);
    return NextResponse.json({
      status: usable ? "ready" : "unavailable",
      summary: usable ? summary : null,
    });
  }

  return NextResponse.json({ status: "pending", summary: null });
}
