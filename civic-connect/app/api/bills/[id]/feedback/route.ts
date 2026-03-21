import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { reason } = await req.json();

  await prisma.$transaction([
    prisma.feedback.create({
      data: { billId: params.id, reason: reason ?? "" },
    }),
    prisma.summary.updateMany({
      where: { billId: params.id },
      data: { flagCount: { increment: 1 } },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
