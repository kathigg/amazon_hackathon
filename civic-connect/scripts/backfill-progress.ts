#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import {
  fetchBillDetail,
  fetchBillSummaries,
  fetchBillActions,
} from "../lib/congress";
import { classifyBillProgress } from "../lib/bill-progress";

async function main() {
  const bills = await prisma.bill.findMany({
    select: {
      id: true,
      congress: true,
      type: true,
      number: true,
      introducedAt: true,
      progressStage: true,
    },
    orderBy: { introducedAt: "desc" },
  });

  console.log(`Backfilling progress for ${bills.length} bills...\n`);

  let checked = 0;
  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;

  for (const bill of bills) {
    checked += 1;

    try {
      const [detail, summaries, actions] = await Promise.all([
        fetchBillDetail(bill.congress, bill.type, bill.number),
        fetchBillSummaries(bill.congress, bill.type, bill.number),
        fetchBillActions(bill.congress, bill.type, bill.number),
      ]);

      if (!detail) {
        failed += 1;
        console.error(`[error   ] ${bill.id.padEnd(20)} no detail returned`);
        continue;
      }

      const introducedAt = resolveIntroducedAt(detail.introducedDate, bill.introducedAt);
      if (!introducedAt) {
        skipped += 1;
        console.warn(
          `[skipped ] ${bill.id.padEnd(20)} no introducedDate from API and no usable existing value`
        );
        continue;
      }

      const originChamber: "House" | "Senate" =
        detail.originChamber ?? (bill.type.toUpperCase().startsWith("S") ? "Senate" : "House");
      const progress = classifyBillProgress({
        billType: bill.type,
        originChamber,
        laws: detail.laws,
        summaries,
        actions,
      });

      const lastSyncedAt = detail.updateDate ? new Date(detail.updateDate) : null;
      const introducedChanged = introducedAt.toISOString() !== bill.introducedAt.toISOString();
      const stageChanged = bill.progressStage !== progress.stage;

      await prisma.bill.update({
        where: { id: bill.id },
        data: {
          introducedAt,
          progressStage: progress.stage,
          stageReachedAt: progress.stageReachedAt,
          latestActionText: progress.latestActionText,
          lastSyncedAt: Number.isFinite(lastSyncedAt?.getTime() ?? NaN)
            ? lastSyncedAt
            : null,
        },
      });

      if (introducedChanged || stageChanged) {
        updated += 1;
        console.log(
          `[updated ] ${bill.id.padEnd(20)} stage=${progress.stage}${
            introducedChanged ? ` introduced=${introducedAt.toISOString().slice(0, 10)}` : ""
          }`
        );
      } else {
        unchanged += 1;
        console.log(`[ok      ] ${bill.id.padEnd(20)} stage=${progress.stage}`);
      }
    } catch (error) {
      failed += 1;
      console.error(
        `[error   ] ${bill.id.padEnd(20)} ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  console.log("\nDone.");
  console.log(`  checked   ${checked}`);
  console.log(`  updated   ${updated}`);
  console.log(`  unchanged ${unchanged}`);
  console.log(`  skipped   ${skipped}`);
  console.log(`  failed    ${failed}`);

  await prisma.$disconnect();
}

function resolveIntroducedAt(
  rawIntroducedDate: string | null | undefined,
  existing: Date
): Date | null {
  if (rawIntroducedDate) {
    const parsed = new Date(`${rawIntroducedDate}T12:00:00.000Z`);
    if (
      !Number.isNaN(parsed.getTime()) &&
      parsed.getUTCFullYear() > 2001 &&
      parsed.getTime() <= Date.now() + 24 * 60 * 60 * 1000
    ) {
      return parsed;
    }
  }
  if (existing.getUTCFullYear() > 2001) {
    return existing;
  }
  return null;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
