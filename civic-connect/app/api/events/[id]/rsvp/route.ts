import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const rsvp = await prisma.rsvp.create({
    data: { eventId: params.id, email },
  });

  return NextResponse.json(rsvp, { status: 201 });
}
