import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encodeTerm,
  filterPredicateForTopic,
  parseTerm,
} from "@/lib/taxonomy";
import { classifyOrgMission } from "@/lib/taxonomy/classify-org";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const topic = searchParams.get("topic") ?? undefined;
  const location = searchParams.get("location") ?? undefined;

  const orgs = await prisma.organization.findMany({
    where: {
      ...(topic && { topicTags: { hasSome: filterPredicateForTopic(topic) } }),
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

  // Normalize incoming tags: accept either raw LoC names or pre-encoded values,
  // store them in encoded form so org registrations match seeded orgs.
  const incoming: string[] = Array.isArray(topicTags) ? topicTags : [];
  let encodedTags = Array.from(
    new Set(
      incoming
        .map((raw) => parseTerm(raw))
        .filter((t): t is NonNullable<ReturnType<typeof parseTerm>> => Boolean(t))
        .map((t) => encodeTerm(t.taxonomy, t.value))
    )
  );

  // Safety net: if the caller sent no usable tags (form skipped, scripted POST,
  // suggester button never clicked), classify the mission via Bedrock so we
  // never persist an unlabeled org. Failures fall through to an empty array,
  // matching the prior behavior — this only ever adds tags, never removes.
  let classificationSource: "client" | "llm" | "llm-unavailable" = "client";
  if (encodedTags.length === 0) {
    const result = await classifyOrgMission({ name, mission });
    if (result.source === "llm" && result.topicTags.length > 0) {
      encodedTags = result.topicTags;
      classificationSource = "llm";
    } else {
      classificationSource = "llm-unavailable";
    }
  }

  const org = await prisma.organization.create({
    data: { name, mission, website, topicTags: encodedTags, location },
  });

  return NextResponse.json(
    { ...org, classificationSource },
    { status: 201 }
  );
}
