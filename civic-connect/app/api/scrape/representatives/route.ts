import { NextRequest, NextResponse } from "next/server";
import { runRepresentativeScrapeJob } from "@/lib/jobs/run-scrape-batch";

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
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
