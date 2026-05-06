import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

config({ path: ".env.local" });

const prisma = new PrismaClient();

async function main() {
  const total = await prisma.summary.count();
  console.log(`\n=== SUMMARY COUNT: ${total} ===\n`);

  const sample = await prisma.summary.findMany({
    take: 5,
    orderBy: { generatedAt: "desc" },
    include: { bill: { select: { id: true, title: true, type: true } } },
  });

  for (const s of sample) {
    const plLen = s.plainLanguage.length;
    const plWords = s.plainLanguage.trim().split(/\s+/).length;
    const wmLen = s.whyItMatters.length;
    const wmWords = s.whyItMatters.trim().split(/\s+/).length;
    console.log("---");
    console.log(`Bill: ${s.bill.id} (${s.bill.type}) — ${s.bill.title.slice(0, 80)}`);
    console.log(`Model: ${s.aiModel}  Generated: ${s.generatedAt.toISOString()}`);
    console.log(`flagCount: ${s.flagCount}`);
    console.log(`\n[plainLanguage] (${plWords} words / ${plLen} chars):`);
    console.log(s.plainLanguage);
    console.log(`\n[keyProvisions] (${s.keyProvisions.length} bullets):`);
    s.keyProvisions.forEach((b, i) => console.log(`  ${i + 1}. ${b}`));
    console.log(`\n[whyItMatters] (${wmWords} words / ${wmLen} chars):`);
    console.log(s.whyItMatters || "(empty)");
    console.log("");
  }

  // Length stats across whole table
  const all = await prisma.summary.findMany({
    select: { plainLanguage: true, whyItMatters: true },
  });
  const plWordCounts = all.map((s) => s.plainLanguage.trim().split(/\s+/).length);
  const wmWordCounts = all.map((s) => s.whyItMatters.trim().split(/\s+/).length);
  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const med = (xs: number[]) => {
    const sorted = [...xs].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  console.log("=== LENGTH STATS (words) ===");
  console.log(
    `plainLanguage: avg=${avg(plWordCounts)} median=${med(plWordCounts)} min=${Math.min(...plWordCounts)} max=${Math.max(...plWordCounts)}`
  );
  console.log(
    `whyItMatters:  avg=${avg(wmWordCounts)} median=${med(wmWordCounts)} min=${Math.min(...wmWordCounts)} max=${Math.max(...wmWordCounts)}`
  );

  // Feedback signals
  try {
    const feedback: any[] = await prisma.$queryRawUnsafe(
      `SELECT * FROM "Feedback" ORDER BY "createdAt" DESC LIMIT 30`
    );
    console.log(`\n=== RECENT FEEDBACK (${feedback.length} rows) ===`);
    for (const f of feedback) {
      console.log(JSON.stringify(f));
    }
  } catch (e: any) {
    console.log(`\n(no Feedback table query: ${e.message})`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
