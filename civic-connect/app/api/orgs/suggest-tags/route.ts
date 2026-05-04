import { NextRequest, NextResponse } from "next/server";
import { classifyOrgMission } from "@/lib/taxonomy/classify-org";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mission = (body as { mission?: unknown })?.mission;
  const name = (body as { name?: unknown })?.name;
  if (typeof mission !== "string" || mission.trim().length < 10) {
    return NextResponse.json(
      { error: "mission is required (min 10 chars)" },
      { status: 400 }
    );
  }
  const result = await classifyOrgMission({
    mission: mission.trim(),
    name: typeof name === "string" ? name.trim() : undefined,
  });
  return NextResponse.json(result);
}
