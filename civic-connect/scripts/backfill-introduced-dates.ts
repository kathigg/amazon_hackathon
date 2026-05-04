#!/usr/bin/env tsx

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { parseCongressDate } from "../lib/bill-dates";

const BASE = "https://api.congress.gov/v3";

function getCongressApiKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) {
    throw new Error("CONGRESS_API_KEY is not set");
  }

  return key;
}

async function fetchOfficialIntroducedDate(
  congress: number,
  type: string,
  number: string
) {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}?api_key=${getCongressApiKey()}&format=json`;
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Congress API error: ${response.status}`);
  }

  const data = await response.json();
  const bill = data.bill;

  if (!bill) {
    throw new Error("Congress API returned no bill payload");
  }

  return parseCongressDate(
    bill.introducedDate,
    bill.latestAction?.actionDate
  );
}

async function main() {
  const bills = await prisma.bill.findMany({
    select: {
      id: true,
      congress: true,
      type: true,
      number: true,
      introducedAt: true,
    },
    orderBy: { introducedAt: "desc" },
  });

  console.log(`Backfilling introduced dates for ${bills.length} bills...\n`);

  let checked = 0;
  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const bill of bills) {
    checked += 1;

    try {
      const officialDate = await fetchOfficialIntroducedDate(
        bill.congress,
        bill.type,
        bill.number
      );
      const currentIso = bill.introducedAt.toISOString();
      const officialIso = officialDate.toISOString();

      if (currentIso !== officialIso) {
        await prisma.bill.update({
          where: { id: bill.id },
          data: { introducedAt: officialDate },
        });
        updated += 1;
        console.log(
          `[updated ] ${bill.id.padEnd(20)} ${currentIso} -> ${officialIso}`
        );
      } else {
        unchanged += 1;
        console.log(`[ok      ] ${bill.id.padEnd(20)} ${officialIso}`);
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
  console.log(`  failed    ${failed}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
