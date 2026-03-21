import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const topic = searchParams.get("topic") ?? undefined;
  const location = searchParams.get("location") ?? undefined;

  const orgs = await prisma.organization.findMany({
    where: {
      ...(topic && { topicTags: { has: topic } }),
      ...(location && { location: { contains: location, mode: "insensitive" } }),
    },
    include: {
      events: {
        where: { date: { gte: new Date() } },
        orderBy: { date: "asc" },
        take: 3,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(orgs);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, mission, website, topicTags, location } = body;

  if (!name || !mission) {
    return NextResponse.json({ error: "name and mission are required" }, { status: 400 });
  }

  const org = await prisma.organization.create({
    data: { name, mission, website, topicTags: topicTags ?? [], location },
  });

  return NextResponse.json(org, { status: 201 });
}
