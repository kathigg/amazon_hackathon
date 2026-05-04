#!/usr/bin/env tsx

import dotenv from "dotenv";
import { prisma } from "../lib/prisma";
import { normalizeTopicTags } from "../lib/topics";

dotenv.config({ path: ".env.local" });

async function main() {
  const bills = await prisma.bill.findMany({
    select: {
      id: true,
      title: true,
      topicTags: true,
    },
  });

  let updated = 0;

  for (const bill of bills) {
    const normalized = normalizeTopicTags(bill.topicTags, bill.title);

    if (JSON.stringify(normalized) === JSON.stringify(bill.topicTags)) {
      continue;
    }

    await prisma.bill.update({
      where: { id: bill.id },
      data: {
        topicTags: normalized,
      },
    });
    updated += 1;
    console.log(`Normalized ${bill.id}: ${bill.topicTags.join(", ")} -> ${normalized.join(", ")}`);
  }

  console.log(`Updated ${updated} bills.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
