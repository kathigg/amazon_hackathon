/**
 * Seed script for civic advocacy organizations.
 * Run with: npm run seed:orgs
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { prisma } from "../lib/prisma";

const organizations = [
  {
    name: "ACLU (American Civil Liberties Union)",
    mission:
      "Defends individual rights and liberties through litigation, policy advocacy, and public education.",
    website: "https://www.aclu.org",
    topicTags: ["Civil Rights", "Immigration", "Technology"],
    location: "National",
  },
  {
    name: "Sierra Club",
    mission:
      "Protects natural resources, public lands, and climate policy through grassroots organizing and national advocacy.",
    website: "https://www.sierraclub.org",
    topicTags: ["Environment", "Infrastructure"],
    location: "National",
  },
  {
    name: "NAACP",
    mission:
      "Advances political, educational, social, and economic equality through organizing, advocacy, and litigation.",
    website: "https://naacp.org",
    topicTags: ["Civil Rights", "Education", "Healthcare"],
    location: "National",
  },
  {
    name: "League of Women Voters",
    mission:
      "Empowers voters and defends democracy through education, advocacy, and civic participation work.",
    website: "https://www.lwv.org",
    topicTags: ["Civil Rights", "Education"],
    location: "National",
  },
  {
    name: "Everytown for Gun Safety",
    mission:
      "Works to reduce gun violence and strengthen public safety through policy advocacy and organizing.",
    website: "https://everytown.org",
    topicTags: ["Civil Rights", "Education"],
    location: "National",
  },
  {
    name: "Planned Parenthood Action Fund",
    mission:
      "Advocates for reproductive healthcare access, sex education, and public policy that supports bodily autonomy.",
    website: "https://www.plannedparenthoodaction.org",
    topicTags: ["Healthcare", "Civil Rights"],
    location: "National",
  },
  {
    name: "National Immigration Law Center",
    mission:
      "Defends and advances the rights of immigrants with low income through litigation, policy advocacy, and movement support.",
    website: "https://www.nilc.org",
    topicTags: ["Immigration", "Civil Rights", "Economy"],
    location: "National",
  },
  {
    name: "Feeding America",
    mission:
      "Leads a nationwide network of food banks working to reduce hunger through service delivery and policy advocacy.",
    website: "https://www.feedingamerica.org",
    topicTags: ["Agriculture", "Economy", "Housing"],
    location: "National",
  },
  {
    name: "Disability Rights Advocates",
    mission:
      "Pursues equal rights and full participation for people with disabilities through strategic litigation and advocacy.",
    website: "https://dralegal.org",
    topicTags: ["Civil Rights", "Healthcare", "Education"],
    location: "National",
  },
  {
    name: "Center for Responsible Lending",
    mission:
      "Protects homeownership and family wealth by advancing fair lending policy and opposing abusive financial practices.",
    website: "https://www.responsiblelending.org",
    topicTags: ["Economy", "Housing"],
    location: "National",
  },
  {
    name: "Electronic Frontier Foundation",
    mission:
      "Defends digital privacy, free expression, and innovation through impact litigation and technology policy advocacy.",
    website: "https://www.eff.org",
    topicTags: ["Technology", "Civil Rights"],
    location: "National",
  },
  {
    name: "Natural Resources Defense Council",
    mission:
      "Uses law, science, and policy advocacy to protect public health and the environment.",
    website: "https://www.nrdc.org",
    topicTags: ["Environment", "Healthcare", "Infrastructure"],
    location: "National",
  },
  {
    name: "Common Cause",
    mission:
      "Strengthens democracy through ethics reform, voting access advocacy, and government accountability work.",
    website: "https://www.commoncause.org",
    topicTags: ["Civil Rights", "Technology"],
    location: "National",
  },
  {
    name: "Human Rights Campaign",
    mission:
      "Advances equality and inclusion for LGBTQ+ people through policy advocacy, education, and organizing.",
    website: "https://www.hrc.org",
    topicTags: ["Civil Rights", "Healthcare", "Education"],
    location: "National",
  },
  {
    name: "National Low Income Housing Coalition",
    mission:
      "Advocates for socially just public policy that ensures people with the lowest incomes have affordable homes.",
    website: "https://nlihc.org",
    topicTags: ["Housing", "Economy"],
    location: "National",
  },
  {
    name: "Union of Concerned Scientists",
    mission:
      "Puts rigorous science to work on climate, clean energy, agriculture, and public safety policy.",
    website: "https://www.ucsusa.org",
    topicTags: ["Environment", "Agriculture", "Defense"],
    location: "National",
  },
  {
    name: "Brennan Center for Justice",
    mission:
      "Works to reform democracy, defend voting rights, and advance justice system change through research and advocacy.",
    website: "https://www.brennancenter.org",
    topicTags: ["Civil Rights", "Technology"],
    location: "National",
  },
  {
    name: "MomsRising",
    mission:
      "Builds grassroots support for economic security, paid leave, education, and healthcare policies that affect families.",
    website: "https://www.momsrising.org",
    topicTags: ["Healthcare", "Education", "Economy"],
    location: "National",
  },
  {
    name: "Center for Democracy & Technology",
    mission:
      "Shapes technology policy around privacy, civil liberties, and digital governance.",
    website: "https://cdt.org",
    topicTags: ["Technology", "Civil Rights"],
    location: "National",
  },
  {
    name: "National Farmers Union",
    mission:
      "Advocates for family farmers, rural communities, and fair agricultural markets.",
    website: "https://nfu.org",
    topicTags: ["Agriculture", "Economy", "Infrastructure"],
    location: "National",
  },
  {
    name: "Veterans Education Success",
    mission:
      "Supports veterans, service members, and military families through higher-education and consumer-protection advocacy.",
    website: "https://vetsedsuccess.org",
    topicTags: ["Defense", "Education", "Economy"],
    location: "National",
  },
  {
    name: "America's Voice",
    mission:
      "Builds support for practical immigration reform and a more welcoming immigration system.",
    website: "https://americasvoice.org",
    topicTags: ["Immigration", "Civil Rights"],
    location: "National",
  },
];

async function main() {
  console.log("Seeding organizations...");

  for (const organization of organizations) {
    await prisma.organization.upsert({
      where: { name: organization.name },
      update: organization,
      create: organization,
    });

    console.log(`  ✓ ${organization.name}`);
  }

  console.log(`Done seeding ${organizations.length} organizations.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
