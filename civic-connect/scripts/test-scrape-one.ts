#!/usr/bin/env tsx
/**
 * Test scraping and analysis for one representative
 */

import { prisma } from "../lib/prisma";
import { scrapeRepresentativeWebsite } from "../lib/scraper";
import { analyzeStance } from "../lib/aws-bedrock";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testScrapeOne() {
  console.log("🧪 Testing scrape and analysis for one representative...\n");

  try {
    // Get one representative
    const rep = await prisma.representative.findFirst({
      where: { websiteUrl: { not: null } },
    });

    if (!rep) {
      console.log("❌ No representatives found in database");
      process.exit(1);
    }

    console.log(`Testing with: ${rep.firstName} ${rep.lastName} (${rep.party}-${rep.state})`);
    console.log(`Website: ${rep.websiteUrl}\n`);

    // Get one recent bill
    const bill = await prisma.bill.findFirst({
      orderBy: { introducedAt: "desc" },
    });

    if (!bill) {
      console.log("❌ No bills found in database");
      process.exit(1);
    }

    console.log(`Testing with bill: ${bill.title}\n`);

    // Scrape website
    console.log("📡 Scraping website...");
    const content = await scrapeRepresentativeWebsite(rep.websiteUrl!);
    
    if (!content) {
      console.log("❌ Failed to scrape website");
      process.exit(1);
    }

    console.log(`✓ Scraped ${content.length} characters\n`);
    console.log(`Preview: ${content.substring(0, 200)}...\n`);

    // Analyze stance
    console.log("🤖 Analyzing stance with AWS Bedrock...");
    const analysis = await analyzeStance(
      `${rep.firstName} ${rep.lastName}`,
      bill.title,
      content,
      rep.websiteUrl
    );

    console.log("\n📊 Analysis Result:");
    console.log(`   Stance: ${analysis.stance}`);
    console.log(`   Confidence: ${(analysis.confidence * 100).toFixed(1)}%`);
    console.log(`   Reasoning: ${analysis.reasoning}\n`);

    // Store in database
    if (analysis.confidence > 0.3) {
      console.log("💾 Storing in database...");
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
      console.log("✓ Stored successfully\n");
    } else {
      console.log("⚠️  Confidence too low, not storing\n");
    }

    console.log("✅ Test complete!");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

testScrapeOne();
