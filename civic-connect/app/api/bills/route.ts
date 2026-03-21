import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const q = searchParams.get("q") ?? undefined;
  const topic = searchParams.get("topic") ?? undefined;
  const page = Number(searchParams.get("page") ?? 1);
  const limit = Number(searchParams.get("limit") ?? 12);
  const skip = (page - 1) * limit;

  const where = {
    ...(q && { title: { contains: q, mode: "insensitive" as const } }),
    ...(topic && { topicTags: { has: topic } }),
  };

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      take: limit,
      skip,
      orderBy: { introducedAt: "desc" },
      include: { summary: true },
    }),
    prisma.bill.count({ where }),
  ]);

  return NextResponse.json({ bills, total, page, pages: Math.ceil(total / limit) });
}
