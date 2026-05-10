/**
 * Regenerate every Bill's Summary in the database via Bedrock.
 * Touches Summary rows only; Bill / Stance / Organization / users untouched.
 *
 * Each summary is upserted as soon as it is generated, so a crash mid-batch
 * never loses completed work. Use --resume to skip bills whose summary was
 * already regenerated within --resume-minutes (default 30).
 *
 * Usage:
 *   docker exec civic-mirror-app npx tsx scripts/regenerate-all-summaries.ts
 *   docker exec civic-mirror-app npx tsx scripts/regenerate-all-summaries.ts --limit 5
 *   docker exec civic-mirror-app npx tsx scripts/regenerate-all-summaries.ts --concurrency 5
 *   docker exec civic-mirror-app npx tsx scripts/regenerate-all-summaries.ts --resume
 *   docker exec civic-mirror-app npx tsx scripts/regenerate-all-summaries.ts --model amazon.nova-micro-v1:0
 *
 * Honors DATABASE_URL from the environment, so the same script works locally
 * (mirror DB) or against production Aurora when run from inside the VPC.
 */
import { prisma } from "../lib/prisma";
import { fetchBillText } from "../lib/congress";
import { preprocessBillText } from "../lib/bill-text";
import { summarizeBill } from "../lib/summarize";

interface Args {
  limit?: number;
  since?: Date;
  modelOverride?: string;
  concurrency: number;
  resume: boolean;
  resumeMinutes: number;
  /** Target one or more specific bill ids (comma-separated). Bypasses --limit/--resume. */
  billIds?: string[];
}

function parseArgs(): Args {
  const args: Args = { concurrency: 3, resume: false, resumeMinutes: 30 };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const val = argv[i + 1];
    if (flag === "--limit") { args.limit = Number(val); i++; }
    else if (flag === "--since") { args.since = new Date(val); i++; }
    else if (flag === "--model") { args.modelOverride = val; i++; }
    else if (flag === "--concurrency") { args.concurrency = Math.max(1, Number(val)); i++; }
    else if (flag === "--resume") { args.resume = true; }
    else if (flag === "--resume-minutes") { args.resumeMinutes = Number(val); i++; }
    else if (flag === "--bill") {
      args.billIds = val.split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    }
  }
  return args;
}

async function regenerateOne(bill: { id: string; title: string; congress: number; type: string; number: string }) {
  let billText = bill.title;
  const textUrl = await fetchBillText(bill.congress, bill.type, bill.number);
  if (textUrl) {
    const res = await fetch(textUrl);
    if (res.ok) billText = preprocessBillText(await res.text());
  }

  // skipTimeout: each parallel worker handles its own try/catch (worker loop
  // below), so we don't want the cross-worker circuit breaker that withTimeout
  // opens on first failure.
  const { plainLanguage, keyProvisions, whyItMatters, aiProvider, aiModel } =
    await summarizeBill(bill.title, billText, { skipTimeout: true });

  await prisma.summary.upsert({
    where: { billId: bill.id },
    update: {
      plainLanguage,
      keyProvisions,
      whyItMatters,
      aiProvider,
      aiModel,
      generatedAt: new Date(),
    },
    create: {
      billId: bill.id,
      plainLanguage,
      keyProvisions,
      whyItMatters,
      aiProvider,
      aiModel,
    },
  });

  return aiModel;
}

async function main() {
  const args = parseArgs();
  if (args.modelOverride) process.env.AWS_BEDROCK_MODEL = args.modelOverride;

  const where: Record<string, unknown> = {};
  if (args.since) where.introducedAt = { gte: args.since };
  if (args.billIds && args.billIds.length > 0) {
    where.id = args.billIds.length === 1 ? args.billIds[0] : { in: args.billIds };
  }

  let bills = await prisma.bill.findMany({
    where,
    select: { id: true, title: true, congress: true, type: true, number: true },
    orderBy: { introducedAt: "desc" },
    take: args.billIds && args.billIds.length > 0 ? undefined : args.limit,
  });

  if (args.resume) {
    const cutoff = new Date(Date.now() - args.resumeMinutes * 60_000);
    const fresh = await prisma.summary.findMany({
      where: {
        billId: { in: bills.map((b) => b.id) },
        generatedAt: { gte: cutoff },
        NOT: { plainLanguage: "Summary unavailable." },
      },
      select: { billId: true },
    });
    const freshSet = new Set(fresh.map((s) => s.billId));
    const skipped = bills.filter((b) => freshSet.has(b.id)).length;
    bills = bills.filter((b) => !freshSet.has(b.id));
    console.log(`--resume skipped ${skipped} bills with summaries newer than ${args.resumeMinutes}min`);
  }

  console.log(`Regenerating ${bills.length} summaries`);
  console.log(`  model:       ${process.env.AWS_BEDROCK_MODEL || "default"}`);
  console.log(`  concurrency: ${args.concurrency}`);
  console.log(`  DB host:     ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0] || "?"}`);
  console.log();

  let ok = 0;
  let fail = 0;
  const failures: Array<{ id: string; err: string }> = [];

  let cursor = 0;
  const total = bills.length;

  async function worker(workerId: number) {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      const bill = bills[idx];
      const prefix = `[${idx + 1}/${total} w${workerId}] ${bill.id}`;
      const t0 = Date.now();
      try {
        const model = await regenerateOne(bill);
        ok++;
        console.log(`${prefix} ✓ ${model} (${Date.now() - t0}ms)`);
      } catch (err) {
        fail++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ id: bill.id, err: msg });
        console.log(`${prefix} ✗ ${msg} (${Date.now() - t0}ms)`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(args.concurrency, total) }, (_, i) => worker(i + 1))
  );

  console.log(`\nDone. ${ok} ok, ${fail} failed.`);
  if (failures.length) {
    console.log("Failures (re-run with --resume to retry only these):");
    failures.forEach((f) => console.log(`  ${f.id}: ${f.err}`));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
