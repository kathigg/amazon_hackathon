import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUserId, trackPageView } from "@/lib/user-tracking";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const path = body?.path;
  const billId = body?.billId;

  if (!path || typeof path !== "string") {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const userId = await getOrCreateUserId();

  await trackPageView(path, userId);

  if (billId && typeof billId === "string") {
    await prisma.bill.update({
      where: { id: billId },
      data: { viewCount: { increment: 1 } },
    });
  }

  return NextResponse.json({ ok: true });
}
