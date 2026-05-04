#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { getRepsByZip } from "../lib/getRepsByZip";

const TEST_ZIPS = ["19716", "90001", "82001", "00000"];

async function main() {
  for (const zip of TEST_ZIPS) {
    const reps = await getRepsByZip(zip);
    console.log(`\n=== ZIP ${zip} → ${reps.length} reps ===`);
    for (const r of reps) {
      console.log(`  ${r.chamber.padEnd(28)} ${r.name.padEnd(28)} (${r.party.charAt(0)})  ${r.office}`);
    }
  }
  process.exit(0);
}

main();
