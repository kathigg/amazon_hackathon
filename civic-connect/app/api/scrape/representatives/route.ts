import { NextRequest, NextResponse } from "next/server";
import { runRepresentativeScrapeJob } from "@/lib/jobs/run-scrape-batch";

export const maxDuration = 300; // 5 minutes

function isAuthorized(req: NextRequest) {
  const headerSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  const querySecret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.CRON_SECRET;

  return (
    !expected ||
    headerSecret === expected ||
    authHeader === `Bearer ${expected}` ||
    querySecret === expected
  );
}

async function handleScrape(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runRepresentativeScrapeJob();
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Scraping job error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return handleScrape(req);
}

export async function POST(req: NextRequest) {
  return handleScrape(req);
}
