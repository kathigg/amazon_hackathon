import { analyzeStance, isBedrockConfigured } from "../aws-bedrock";
import { prisma } from "../prisma";
import { scrapeRepresentativeWebsite } from "../scraper";
import {
  DEFAULT_RECENT_BILLS_TO_ANALYZE,
  DEFAULT_REPRESENTATIVES_TO_SCRAPE,
  selectRecentBillsForStanceAnalysis,
  selectRepresentativesToScrape,
  type BillAnalysisTarget,
  type RepresentativeScrapeTarget,
} from "./select-reps-to-scrape";

export const DEFAULT_SCRAPE_REQUEST_DELAY_MS = 2_000;
export const MAX_SCRAPED_CONTENT_LENGTH = 50_000;
export const STANCE_CONFIDENCE_THRESHOLD = 0.3;

export interface RunRepresentativeScrapeBatchOptions {
  representatives: RepresentativeScrapeTarget[];
  recentBills?: BillAnalysisTarget[];
  billLimit?: number;
  requestDelayMs?: number;
}

export interface RunRepresentativeScrapeJobOptions {
  take?: number;
  billLimit?: number;
  requestDelayMs?: number;
}

export interface RepresentativeScrapeJobResult {
  success: true;
  scrapedCount: number;
  stancesCreated: number;
  processedReps: number;
}

export async function runRepresentativeScrapeJob(
  options: RunRepresentativeScrapeJobOptions = {}
): Promise<RepresentativeScrapeJobResult> {
  if (!isBedrockConfigured()) {
    throw new Error("AWS Bedrock not configured");
  }

  const representatives = await selectRepresentativesToScrape(
    options.take ?? DEFAULT_REPRESENTATIVES_TO_SCRAPE
  );

  return runRepresentativeScrapeBatch({
    representatives,
    billLimit: options.billLimit,
    requestDelayMs: options.requestDelayMs,
  });
}

export async function runRepresentativeScrapeBatch(
  options: RunRepresentativeScrapeBatchOptions
): Promise<RepresentativeScrapeJobResult> {
  if (!isBedrockConfigured()) {
    throw new Error("AWS Bedrock not configured");
  }

  const recentBills =
    options.recentBills ??
    (await selectRecentBillsForStanceAnalysis(
      options.billLimit ?? DEFAULT_RECENT_BILLS_TO_ANALYZE
    ));

  let scrapedCount = 0;
  let stancesCreated = 0;

  for (const rep of options.representatives) {
    try {
      const content = await scrapeRepresentativeWebsite(rep.websiteUrl);

      if (content) {
        await prisma.scrapedContent.create({
          data: {
            repId: rep.id,
            url: rep.websiteUrl,
            content: content.substring(0, MAX_SCRAPED_CONTENT_LENGTH),
          },
        });

        scrapedCount++;

        for (const bill of recentBills) {
          const analysis = await analyzeStance(
            `${rep.firstName} ${rep.lastName}`,
            bill.title,
            content,
            rep.websiteUrl
          );

          if (analysis.confidence > STANCE_CONFIDENCE_THRESHOLD) {
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
                source: "official_public_record",
              },
              create: {
                repId: rep.id,
                billId: bill.id,
                stance: analysis.stance,
                confidence: analysis.confidence,
                reasoning: analysis.reasoning,
                source: "official_public_record",
              },
            });

            stancesCreated++;
          }
        }

        await prisma.representative.update({
          where: { id: rep.id },
          data: { lastScraped: new Date() },
        });
      }

      if ((options.requestDelayMs ?? DEFAULT_SCRAPE_REQUEST_DELAY_MS) > 0) {
        await sleep(options.requestDelayMs ?? DEFAULT_SCRAPE_REQUEST_DELAY_MS);
      }
    } catch (error) {
      console.error(`Error processing ${rep.firstName} ${rep.lastName}:`, error);
    }
  }

  return {
    success: true,
    scrapedCount,
    stancesCreated,
    processedReps: options.representatives.length,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
