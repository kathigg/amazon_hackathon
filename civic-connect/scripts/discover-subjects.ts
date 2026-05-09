/**
 * Tally Bill.legislativeSubjects across all bills and print them sorted by frequency.
 *
 * Used to decide which legislative subjects are worth curating image pools for.
 *
 * Usage:
 *   npm run discover:subjects
 *   npm run discover:subjects -- --min 3 --top 200
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

interface CliOptions {
  min: number;
  top: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = { min: 3, top: 200 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--min") opts.min = Number(argv[++i]);
    else if (arg === "--top") opts.top = Number(argv[++i]);
  }
  return opts;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  const bills = await prisma.bill.findMany({
    select: { id: true, legislativeSubjects: true },
  });

  const counts = new Map<string, number>();
  let billsWithSubjects = 0;
  for (const bill of bills) {
    const subjects =
      (bill as unknown as { legislativeSubjects?: string[] }).legislativeSubjects ?? [];
    if (subjects.length > 0) billsWithSubjects += 1;
    for (const subject of subjects) {
      const tidy = subject?.trim();
      if (!tidy) continue;
      counts.set(tidy, (counts.get(tidy) ?? 0) + 1);
    }
  }

  const sorted = [...counts.entries()]
    .filter(([, count]) => count >= opts.min)
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.top);

  console.log(
    `Bills: ${bills.length}; with subjects: ${billsWithSubjects}; distinct subjects (>= ${opts.min}): ${sorted.length}\n`
  );

  for (const [subject, count] of sorted) {
    console.log(`  ${count.toString().padStart(5)}  ${subject}`);
  }

  if (billsWithSubjects === 0) {
    console.log(
      "\nNo bills have legislativeSubjects yet. Run `npm run ingest` after the schema and ingestion changes are deployed."
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
