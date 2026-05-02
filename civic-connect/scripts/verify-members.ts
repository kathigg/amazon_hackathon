import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";

async function main() {
  const totalMembers = await prisma.member.count();
  const totalTerms = await prisma.term.count();
  const activeTerms = await prisma.term.count({ where: { endYear: null } });
  const senateActive = await prisma.term.count({ where: { endYear: null, chamber: "Senate" } });
  const houseActive = await prisma.term.count({
    where: { endYear: null, chamber: "House of Representatives" },
  });

  console.log("=== Counts ===");
  console.log(`  Members:       ${totalMembers}`);
  console.log(`  Terms total:   ${totalTerms}`);
  console.log(`  Terms active:  ${activeTerms}`);
  console.log(`  Senate active: ${senateActive}`);
  console.log(`  House active:  ${houseActive}`);

  console.log("\n=== Lisa Blunt Rochester (B001303) — all terms ===");
  const lbr = await prisma.term.findMany({
    where: { bioguideId: "B001303" },
    orderBy: { startYear: "asc" },
    include: { member: { select: { name: true } } },
  });
  for (const t of lbr) {
    console.log(
      `  ${t.member.name} | ${t.chamber} | ${t.state} | district=${t.district ?? "-"} | ${t.startYear}-${t.endYear ?? "present"} | party=${t.party}`
    );
  }

  console.log("\n=== Delaware active reps (state=DE, endYear null) ===");
  const de = await prisma.term.findMany({
    where: { state: "DE", endYear: null },
    include: { member: true },
    orderBy: [{ chamber: "asc" }, { member: { name: "asc" } }],
  });
  for (const t of de) {
    console.log(
      `  ${t.member.name} | ${t.chamber}${t.district ? ` D${t.district}` : ""} | ${t.party}`
    );
  }

  console.log("\n=== Members with multiple historical terms (top 10) ===");
  const multi = await prisma.member.findMany({
    include: { _count: { select: { terms: true } }, terms: true },
    orderBy: { terms: { _count: "desc" } },
    take: 10,
  });
  for (const m of multi) {
    const chambers = [...new Set(m.terms.map((t) => t.chamber))].join("+");
    console.log(`  ${m.name} (${m.bioguideId}) | ${m._count.terms} terms | chambers: ${chambers}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
