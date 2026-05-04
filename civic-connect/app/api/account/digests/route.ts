import { NextRequest, NextResponse } from "next/server";
import { dispatchDueDigestEmails } from "@/lib/account-digests";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;

  if (
    expected &&
    authHeader !== `Bearer ${expected}` &&
    cronSecret !== expected
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await dispatchDueDigestEmails();
    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error("Digest dispatch failed:", error);
    return NextResponse.json(
      { error: "Failed to dispatch digests." },
      { status: 500 }
    );
  }
}
