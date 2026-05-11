#!/usr/bin/env tsx
/**
 * LEGACY — writes Bill.imageUrl with a deterministic Wikimedia hotlink.
 *
 * The current curated path is: curate:images → embed:images → reassign:images,
 * which populates Bill.imageAssetId from the BillImageAsset pool. This script
 * does NOT touch imageAssetId; it only fills the legacy fallback field. Use
 * `npm run backfill:bill-images` (scripts/backfill-bill-image-assets.ts) for
 * curated-pool assignment.
 */
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { getBillImageRecord } from "../lib/bill-image-categories";

dotenv.config({ path: ".env.local" });
const prisma = new PrismaClient();

const PAGE_SIZE = 250;

async function main() {
  let cursor: string | undefined;
  let updated = 0;

  while (true) {
    const bills = await prisma.bill.findMany({
      take: PAGE_SIZE,
      ...(cursor
        ? {
            skip: 1,
            cursor: { id: cursor },
          }
        : {}),
      orderBy: { id: "asc" },
      select: {
        id: true,
        topicTags: true,
      },
    });

    if (bills.length === 0) {
      break;
    }

    for (const bill of bills) {
      const image = getBillImageRecord(bill.id, bill.topicTags);
      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          imageUrl: image.imageUrl,
          imageThumbnailUrl: image.imageUrl,
          imageSource: "wikimedia-category-pool",
          imageSearchQuery: image.categoryLabel,
          imageFetchedAt: new Date(),
        },
      });
      updated += 1;
    }

    cursor = bills[bills.length - 1]?.id;
    console.log(`updated ${updated} bills`);
  }

  console.log(`done: ${updated} bills updated`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
