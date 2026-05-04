import { NextRequest, NextResponse } from "next/server";
import { dispatchDueDigestEmails } from "@/lib/account-digests";

function isAuthorized(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  return (
    !expected ||
    authHeader === `Bearer ${expected}` ||
    cronSecret === expected ||
    querySecret === expected
  );
}

async function handleDigestDispatch(req: NextRequest) {
  if (!isAuthorized(req)) {
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

export async function GET(req: NextRequest) {
  return handleDigestDispatch(req);
}

export async function POST(req: NextRequest) {
  return handleDigestDispatch(req);
}
