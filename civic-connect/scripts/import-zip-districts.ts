#!/usr/bin/env tsx
/**
 * Import the U.S. Census Bureau ZCTA → 119th-Congress-District relationship.
 * Source: https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_zcta520_natl.txt
 * Pipe-delimited, ~5.9 MB. One row per (ZCTA, CD) intersection.
 *
 * Re-run after a new Congress / mid-decade redistricting; createMany skipDuplicates
 * makes it idempotent for the same Congress.
 */

import { prisma } from "../lib/prisma";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SOURCE_URL =
  "https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_zcta520_natl.txt";

// State FIPS → [USPS code, full name]. 50 states + DC. Territories intentionally
// excluded: their delegates/commissioners aren't in the Representative table
// produced by scripts/seed-representatives.ts.
const FIPS_TO_STATE: Record<string, [string, string]> = {
  "01": ["AL", "Alabama"],
  "02": ["AK", "Alaska"],
  "04": ["AZ", "Arizona"],
  "05": ["AR", "Arkansas"],
  "06": ["CA", "California"],
  "08": ["CO", "Colorado"],
  "09": ["CT", "Connecticut"],
  "10": ["DE", "Delaware"],
  "11": ["DC", "District of Columbia"],
  "12": ["FL", "Florida"],
  "13": ["GA", "Georgia"],
  "15": ["HI", "Hawaii"],
  "16": ["ID", "Idaho"],
  "17": ["IL", "Illinois"],
  "18": ["IN", "Indiana"],
  "19": ["IA", "Iowa"],
  "20": ["KS", "Kansas"],
  "21": ["KY", "Kentucky"],
  "22": ["LA", "Louisiana"],
  "23": ["ME", "Maine"],
  "24": ["MD", "Maryland"],
  "25": ["MA", "Massachusetts"],
  "26": ["MI", "Michigan"],
  "27": ["MN", "Minnesota"],
  "28": ["MS", "Mississippi"],
  "29": ["MO", "Missouri"],
  "30": ["MT", "Montana"],
  "31": ["NE", "Nebraska"],
  "32": ["NV", "Nevada"],
  "33": ["NH", "New Hampshire"],
  "34": ["NJ", "New Jersey"],
  "35": ["NM", "New Mexico"],
  "36": ["NY", "New York"],
  "37": ["NC", "North Carolina"],
  "38": ["ND", "North Dakota"],
  "39": ["OH", "Ohio"],
  "40": ["OK", "Oklahoma"],
  "41": ["OR", "Oregon"],
  "42": ["PA", "Pennsylvania"],
  "44": ["RI", "Rhode Island"],
  "45": ["SC", "South Carolina"],
  "46": ["SD", "South Dakota"],
  "47": ["TN", "Tennessee"],
  "48": ["TX", "Texas"],
  "49": ["UT", "Utah"],
  "50": ["VT", "Vermont"],
  "51": ["VA", "Virginia"],
  "53": ["WA", "Washington"],
  "54": ["WV", "West Virginia"],
  "55": ["WI", "Wisconsin"],
  "56": ["WY", "Wyoming"],
};

interface Row {
  zip: string;
  stateCode: string;
  stateName: string;
  district: string;
}

function normalizeDistrict(rawCdGeoid: string): string | null {
  // GEOID_CD119_20 = 4 chars: 2-digit state FIPS + 2-digit district.
  // "00" = at-large; "ZZ" = non-voting (territories) — skip.
  const dd = rawCdGeoid.slice(2);
  if (dd === "ZZ") return null;
  if (dd === "00") return "0";
  // strip any leading zero: "01" -> "1", "10" -> "10"
  const n = parseInt(dd, 10);
  if (Number.isNaN(n)) return null;
  return n.toString();
}

async function fetchSource(): Promise<string> {
  console.log(`Downloading ${SOURCE_URL}…`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Census fetch failed: ${res.status}`);
  const text = await res.text();
  console.log(`Downloaded ${(text.length / 1024 / 1024).toFixed(2)} MB`);
  return text;
}

function parseRows(text: string): Row[] {
  // Strip BOM if present
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const lines = clean.split(/\r?\n/);
  const header = lines[0].split("|");
  const cdIdx = header.indexOf("GEOID_CD119_20");
  const zipIdx = header.indexOf("GEOID_ZCTA5_20");
  if (cdIdx < 0 || zipIdx < 0) {
    throw new Error("Required columns not found in Census file header");
  }

  const rows: Row[] = [];
  let skippedNoZip = 0;
  let skippedNonState = 0;
  let skippedNonVoting = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split("|");
    const zip = cells[zipIdx];
    const cdGeoid = cells[cdIdx];
    if (!zip || !/^\d{5}$/.test(zip)) {
      skippedNoZip++;
      continue;
    }
    if (!cdGeoid || cdGeoid.length !== 4) continue;

    const fips = cdGeoid.slice(0, 2);
    const state = FIPS_TO_STATE[fips];
    if (!state) {
      skippedNonState++;
      continue;
    }
    const district = normalizeDistrict(cdGeoid);
    if (district === null) {
      skippedNonVoting++;
      continue;
    }
    rows.push({
      zip,
      stateCode: state[0],
      stateName: state[1],
      district,
    });
  }

  console.log(
    `Parsed ${rows.length} rows  (skipped: no-zip=${skippedNoZip}, non-state-fips=${skippedNonState}, non-voting=${skippedNonVoting})`
  );
  return rows;
}

async function importRows(rows: Row[]) {
  console.log(`Wiping existing ZipDistrict rows…`);
  await prisma.zipDistrict.deleteMany({});

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await prisma.zipDistrict.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += res.count;
    if (i % (BATCH * 10) === 0) {
      console.log(`  …inserted ${inserted}/${rows.length}`);
    }
  }
  console.log(`✓ Inserted ${inserted} ZipDistrict rows`);
}

async function summary() {
  const total = await prisma.zipDistrict.count();
  const distinctZips = await prisma.zipDistrict.groupBy({
    by: ["zip"],
    _count: { _all: true },
  });
  const multi = distinctZips.filter((z) => z._count._all > 1).length;
  console.log(
    `Summary: ${total} rows, ${distinctZips.length} distinct ZCTAs, ${multi} ZCTAs span multiple districts`
  );
}

async function main() {
  const text = await fetchSource();
  const rows = parseRows(text);
  await importRows(rows);
  await summary();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("❌ Import failed:", e);
  process.exit(1);
});
