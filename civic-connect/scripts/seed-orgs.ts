/**
 * Seed script for real civic advocacy organizations.
 * Run with: npx ts-node --project tsconfig.json scripts/seed-orgs.ts
 * Or add to package.json: "seed:orgs": "ts-node scripts/seed-orgs.ts"
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";
import { encodeTerm } from "../lib/taxonomy";

// Tags listed as raw LoC Policy Area names; encoded below before insert.
const orgs = [
  {
    name: "ACLU (American Civil Liberties Union)",
    mission: "Defends individual rights and liberties guaranteed by the Constitution and laws of the United States through litigation, advocacy, and community education.",
    website: "https://www.aclu.org",
    topicTags: [
      "Civil Rights and Liberties, Minority Issues",
      "Crime and Law Enforcement",
      "Immigration",
      "Law",
    ],
    location: "National",
  },
  {
    name: "Sierra Club",
    mission: "Explores, enjoys, and protects the wild places of the earth; practices and promotes the responsible use of the earth's ecosystems and resources.",
    website: "https://www.sierraclub.org",
    topicTags: [
      "Environmental Protection",
      "Energy",
      "Public Lands and Natural Resources",
    ],
    location: "National",
  },
  {
    name: "NAACP",
    mission: "Works to ensure the political, educational, social, and economic equality of rights of all persons and to eliminate race-based discrimination.",
    website: "https://naacp.org",
    topicTags: [
      "Civil Rights and Liberties, Minority Issues",
      "Education",
      "Crime and Law Enforcement",
      "Health",
    ],
    location: "National",
  },
  {
    name: "League of Women Voters",
    mission: "A nonpartisan organization that empowers voters and defends democracy through advocacy, education, and litigation at the local, state, and national levels.",
    website: "https://www.lwv.org",
    topicTags: [
      "Government Operations and Politics",
      "Civil Rights and Liberties, Minority Issues",
    ],
    location: "National",
  },
  {
    name: "Everytown for Gun Safety",
    mission: "The largest gun violence prevention organization in America, working to end gun violence and build safer communities.",
    website: "https://everytown.org",
    topicTags: ["Crime and Law Enforcement"],
    location: "National",
  },
  {
    name: "Planned Parenthood Action Fund",
    mission: "Advocates for access to reproductive health care and sex education, and works to elect candidates who support reproductive rights.",
    website: "https://www.plannedparenthoodaction.org",
    topicTags: [
      "Health",
      "Civil Rights and Liberties, Minority Issues",
    ],
    location: "National",
  },
  {
    name: "National Immigration Law Center",
    mission: "Defends and advances the rights of immigrants with low income through litigation, policy advocacy, and capacity-building.",
    website: "https://www.nilc.org",
    topicTags: [
      "Immigration",
      "Civil Rights and Liberties, Minority Issues",
      "Labor and Employment",
    ],
    location: "National",
  },
  {
    name: "Feeding America",
    mission: "A nationwide network of food banks working to end hunger in the United States through food distribution and advocacy.",
    website: "https://www.feedingamerica.org",
    topicTags: ["Social Welfare", "Agriculture and Food"],
    location: "National",
  },
  {
    name: "Disability Rights Advocates",
    mission: "A nonprofit legal center that fights for equal rights and opportunities for people with all types of disabilities.",
    website: "https://dralegal.org",
    topicTags: [
      "Civil Rights and Liberties, Minority Issues",
      "Health",
      "Education",
    ],
    location: "National",
  },
  {
    name: "Center for Responsible Lending",
    mission: "A nonprofit research and policy organization dedicated to protecting homeownership and family wealth by working to eliminate abusive financial practices.",
    website: "https://www.responsiblelending.org",
    topicTags: [
      "Finance and Financial Sector",
      "Housing and Community Development",
      "Commerce",
    ],
    location: "National",
  },
];

async function main() {
  console.log("Seeding organizations...");

  for (const org of orgs) {
    const encodedTags = org.topicTags.map((t) =>
      encodeTerm("loc-policy-area", t)
    );
    await prisma.organization.upsert({
      where: { name: org.name },
      update: {
        mission: org.mission,
        website: org.website,
        topicTags: encodedTags,
        location: org.location,
      },
      create: { ...org, topicTags: encodedTags },
    });
    console.log(`  ✓ ${org.name}`);
  }

  console.log("Done seeding organizations.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
