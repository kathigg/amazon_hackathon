import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  encodeTerm,
  filterPredicateForTopic,
  parseTerm,
} from "@/lib/taxonomy";
import {
  classifyOrgMission,
  normalizeUnknownLabels,
} from "@/lib/taxonomy/classify-org";

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

  // Split caller-submitted tags into known (in our vocab) vs unknown (free-form
  // strings like "voting rights" or "cryptocurrency policy").
  const incoming: string[] = Array.isArray(topicTags) ? topicTags : [];
  const known = new Set<string>();
  const unknown: string[] = [];
  for (const raw of incoming) {
    if (typeof raw !== "string" || raw.trim() === "") continue;
    const parsed = parseTerm(raw);
    if (parsed) {
      known.add(encodeTerm(parsed.taxonomy, parsed.value));
    } else {
      unknown.push(raw.trim());
    }
  }

  let classificationSource:
    | "client"
    | "client+normalized"
    | "llm"
    | "llm-unavailable" = "client";
  let encodedTags = Array.from(known);

  // Step 1: if the caller submitted any unknown labels, ask the LLM to map
  // them onto the closest LoC labels (uses name+mission for disambiguation).
  // Adds to the known set; never removes anything the caller validly chose.
  if (unknown.length > 0) {
    const normalized = await normalizeUnknownLabels({
      unknownLabels: unknown,
      name,
      mission,
    });
    if (normalized.source === "llm" && normalized.topicTags.length > 0) {
      encodedTags = Array.from(new Set([...encodedTags, ...normalized.topicTags]));
      classificationSource = encodedTags.length > known.size ? "client+normalized" : "client";
    }
  }

  // Step 2: safety net — if we still have nothing (form skipped, scripted POST
  // with no tags, all unknowns failed to normalize), classify the mission
  // directly. Same prompt pattern, mission as the only signal.
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
