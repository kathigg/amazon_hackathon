import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeRepresentativeWebsite } from "@/lib/scraper";
import { analyzeStance, isBedrockConfigured } from "@/lib/aws-bedrock";

export const maxDuration = 300; // 5 minutes

export async function POST(req: NextRequest) {
  // Verify cron secret
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isBedrockConfigured()) {
    return NextResponse.json(
      { error: "AWS Bedrock not configured" },
      { status: 500 }
    );
  }

  try {
    // Get all representatives
    const representatives = await prisma.representative.findMany({
      where: { websiteUrl: { not: null } },
      take: 50, // Process 50 per run to stay within time limits
      orderBy: { lastScraped: "asc" }, // Prioritize least recently scraped
    });

    // Get recent bills to analyze
    const recentBills = await prisma.bill.findMany({
      take: 20,
      orderBy: { introducedAt: "desc" },
      select: { id: true, title: true },
    });

    let scrapedCount = 0;
    let stancesCreated = 0;

    for (const rep of representatives) {
      if (!rep.websiteUrl) continue;

      try {
        // Scrape website
        const content = await scrapeRepresentativeWebsite(rep.websiteUrl);

        if (content) {
          // Store scraped content
          await prisma.scrapedContent.create({
            data: {
              repId: rep.id,
              url: rep.websiteUrl,
              content: content.substring(0, 50000), // Limit size
            },
          });

          scrapedCount++;

          // Analyze stance for each recent bill
          for (const bill of recentBills) {
            const analysis = await analyzeStance(
              `${rep.firstName} ${rep.lastName}`,
              bill.title,
              content
            );

            // Only store if confidence is above threshold
            if (analysis.confidence > 0.3) {
              await prisma.repStance.upsert({
                where: {
                  repId_billId: {
                    repId: rep.id,
                    billId: bill.id,
                  },
                },
                update: {
                  stance: analysis.stance,
                  confidence: analysis.confidence,
                  reasoning: analysis.reasoning,
                  source: "scraped",
                },
                create: {
                  repId: rep.id,
                  billId: bill.id,
                  stance: analysis.stance,
                  confidence: analysis.confidence,
                  reasoning: analysis.reasoning,
                  source: "scraped",
                },
              });

              stancesCreated++;
            }
          }

          // Update last scraped time
          await prisma.representative.update({
            where: { id: rep.id },
            data: { lastScraped: new Date() },
          });
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(`Error processing ${rep.firstName} ${rep.lastName}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      scrapedCount,
      stancesCreated,
      processedReps: representatives.length,
    });
  } catch (error: any) {
    console.error("Scraping job error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
