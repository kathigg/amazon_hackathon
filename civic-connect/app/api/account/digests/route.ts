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
    const dryRun = ["1", "true", "yes"].includes(
      req.nextUrl.searchParams.get("dryRun")?.toLowerCase() ?? ""
    );
    const targetEmail = req.nextUrl.searchParams.get("email") ?? undefined;
    const force = req.nextUrl.searchParams.get("force");
    const forceDigestKind =
      force === "daily" || force === "weekly" || force === "onboarding"
        ? force
        : undefined;
    const nowParam = req.nextUrl.searchParams.get("now");
    const now = nowParam ? new Date(nowParam) : new Date();

    if (Number.isNaN(now.getTime())) {
      return NextResponse.json({ error: "Invalid now timestamp." }, { status: 400 });
    }

    const stats = await dispatchDueDigestEmails(now, {
      dryRun,
      targetEmail,
      forceDigestKind,
    });
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
