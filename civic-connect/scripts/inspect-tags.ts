import { config } from "dotenv";
config({ path: ".env.local" });
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("\n=== ORG TAGS (all 10) ===");
  const orgs = await prisma.organization.findMany({
    select: { name: true, topicTags: true },
  });
  for (const o of orgs) {
    console.log(`  ${o.name.padEnd(45)} ${JSON.stringify(o.topicTags)}`);
  }

  console.log("\n=== DISTINCT BILL TAGS + COUNT ===");
  const bills = await prisma.bill.findMany({ select: { topicTags: true } });
  const counts: Record<string, number> = {};
  for (const b of bills) {
    for (const t of b.topicTags) counts[t] = (counts[t] ?? 0) + 1;
  }
  for (const [t, c] of Object.entries(counts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${t.padEnd(20)} ${c}`);
  }

  const noTag = await prisma.bill.count({ where: { topicTags: { isEmpty: true } } });
  console.log(`\n  Bills with NO tags: ${noTag} / ${bills.length}`);

  console.log("\n=== DISTINCT ORG TAGS + COUNT ===");
  const ocounts: Record<string, number> = {};
  for (const o of orgs) for (const t of o.topicTags) ocounts[t] = (ocounts[t] ?? 0) + 1;
  for (const [t, c] of Object.entries(ocounts).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${t.padEnd(25)} ${c}`);
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
