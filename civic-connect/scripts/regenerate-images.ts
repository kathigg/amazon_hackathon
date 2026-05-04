#!/usr/bin/env tsx
/**
 * Regenerate Openverse images for bills using their AI summaries
 * This will fetch better, more relevant images based on what the bill actually does
 */

import { prisma } from "../lib/prisma";
import { fetchBestOpenverseBillImage, getNoImageAttemptMetadata } from "../lib/openverse";
import { parseTerm } from "../lib/taxonomy";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function regenerateImages() {
  console.log("🖼️  Regenerating Openverse images using AI summaries...\n");

  try {
    // Get all bills that have summaries
    const bills = await prisma.bill.findMany({
      where: {
        summary: {
          isNot: null,
        },
      },
      include: {
        summary: true,
      },
      orderBy: {
        viewCount: "desc", // Prioritize popular bills
      },
    });

    console.log(`Found ${bills.length} bills with summaries\n`);

    let updated = 0;
    let failed = 0;
    let skipped = 0;

    for (const bill of bills) {
      try {
        console.log(`Processing: ${bill.id} - ${bill.title.substring(0, 60)}...`);

        if (!bill.summary) {
          console.log("  ⚠️  No summary, skipping");
          skipped++;
          continue;
        }

        // Fetch new image using the summary
        const image = await fetchBestOpenverseBillImage({
          title: bill.title,
          topicTags: bill.topicTags,
          summary: bill.summary.plainLanguage,
        });

        if (image) {
          await prisma.bill.update({
            where: { id: bill.id },
            data: image,
          });
          console.log(`  ✓ Updated with query: "${image.imageSearchQuery}"`);
          updated++;
        } else {
          await prisma.bill.update({
            where: { id: bill.id },
            data: getNoImageAttemptMetadata(parseTerm(bill.topicTags[0])?.value.toLowerCase() ?? null),
          });
          console.log(`  ⚠️  No image found`);
          failed++;
        }

        // Rate limiting - be nice to Openverse API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ❌ Error: ${error}`);
        failed++;
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Total: ${bills.length}`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

regenerateImages();
