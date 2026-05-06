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
  {
    name: "National Women's Law Center",
    mission:
      "Advocates for gender justice in education, workplace equity, and economic security policy.",
    website: "https://nwlc.org",
    topicTags: ["Civil Rights", "Education", "Economy"],
    location: "National",
  },
  {
    name: "Public Citizen",
    mission:
      "Promotes government accountability, consumer rights, and public-interest protections in federal policy.",
    website: "https://www.citizen.org",
    topicTags: ["Civil Rights", "Healthcare", "Government Operations and Politics"],
    location: "National",
  },
  {
    name: "Clean Water Action",
    mission:
      "Builds grassroots power to protect clean water, public health, and climate resilience.",
    website: "https://www.cleanwateraction.org",
    topicTags: ["Environmental Protection", "Water Resources Development", "Health"],
    location: "National",
  },
  {
    name: "The Nature Conservancy",
    mission:
      "Conserves lands and waters through science-based policy and partnerships.",
    website: "https://www.nature.org",
    topicTags: ["Public Lands and Natural Resources", "Environmental Protection"],
    location: "National",
  },
  {
    name: "National Wildlife Federation",
    mission:
      "Protects wildlife habitat and supports conservation policy at federal and state levels.",
    website: "https://www.nwf.org",
    topicTags: ["Environmental Protection", "Animals", "Agriculture and Food"],
    location: "National",
  },
  {
    name: "Environmental Defense Fund",
    mission:
      "Advances market-based and science-driven environmental policy solutions.",
    website: "https://www.edf.org",
    topicTags: ["Environmental Protection", "Energy", "Commerce"],
    location: "National",
  },
  {
    name: "Center on Budget and Policy Priorities",
    mission:
      "Analyzes federal budget and tax policy impacts on low- and moderate-income households.",
    website: "https://www.cbpp.org",
    topicTags: ["Economics and Public Finance", "Taxation", "Social Welfare"],
    location: "National",
  },
  {
    name: "Tax Foundation",
    mission:
      "Researches tax policy design, economic competitiveness, and fiscal outcomes.",
    website: "https://taxfoundation.org",
    topicTags: ["Taxation", "Economics and Public Finance", "Commerce"],
    location: "National",
  },
  {
    name: "National Taxpayers Union",
    mission:
      "Advocates for taxpayer-focused fiscal policy and transparent government spending.",
    website: "https://www.ntu.org",
    topicTags: ["Taxation", "Economics and Public Finance", "Government Operations and Politics"],
    location: "National",
  },
  {
    name: "Center for American Progress",
    mission:
      "Develops policy proposals across the economy, education, and clean energy.",
    website: "https://www.americanprogress.org",
    topicTags: ["Education", "Economics and Public Finance", "Energy"],
    location: "National",
  },
  {
    name: "Urban Institute",
    mission:
      "Produces nonpartisan research on federal social, housing, and economic policy.",
    website: "https://www.urban.org",
    topicTags: ["Housing and Community Development", "Social Welfare", "Economics and Public Finance"],
    location: "National",
  },
  {
    name: "Brookings Institution",
    mission:
      "Provides policy research on governance, economic growth, and global affairs.",
    website: "https://www.brookings.edu",
    topicTags: ["Government Operations and Politics", "Economics and Public Finance", "International Affairs"],
    location: "National",
  },
  {
    name: "Pew Charitable Trusts",
    mission:
      "Conducts policy research and advocacy on fiscal management, oceans, and public health.",
    website: "https://www.pewtrusts.org",
    topicTags: ["Government Operations and Politics", "Health", "Public Lands and Natural Resources"],
    location: "National",
  },
  {
    name: "Center for Strategic and International Studies",
    mission:
      "Analyzes national security and foreign policy trends for decision-makers.",
    website: "https://www.csis.org",
    topicTags: ["Armed Forces and National Security", "International Affairs", "Foreign Trade and International Finance"],
    location: "National",
  },
  {
    name: "Council on Foreign Relations",
    mission:
      "Advances understanding of U.S. foreign policy and global economic issues.",
    website: "https://www.cfr.org",
    topicTags: ["International Affairs", "Foreign Trade and International Finance", "Armed Forces and National Security"],
    location: "National",
  },
  {
    name: "Truman National Security Project",
    mission:
      "Develops leadership and policy ideas focused on U.S. national security.",
    website: "https://www.trumancenter.org",
    topicTags: ["Armed Forces and National Security", "International Affairs"],
    location: "National",
  },
  {
    name: "National Education Association",
    mission:
      "Represents public educators and advocates for equitable school funding and student support.",
    website: "https://www.nea.org",
    topicTags: ["Education", "Labor and Employment", "Families"],
    location: "National",
  },
  {
    name: "American Federation of Teachers",
    mission:
      "Advocates for educators, healthcare workers, and public services through labor organizing.",
    website: "https://www.aft.org",
    topicTags: ["Education", "Labor and Employment", "Health"],
    location: "National",
  },
  {
    name: "Achieve",
    mission:
      "Supports standards-based policy and college-career readiness in K-12 education.",
    website: "https://www.achieve.org",
    topicTags: ["Education", "Science, Technology, Communications"],
    location: "National",
  },
  {
    name: "National Council on Teacher Quality",
    mission:
      "Evaluates teacher preparation and workforce policy to improve classroom outcomes.",
    website: "https://www.nctq.org",
    topicTags: ["Education", "Labor and Employment"],
    location: "National",
  },
  {
    name: "KFF",
    mission:
      "Provides independent analysis on healthcare policy, Medicaid, and public insurance programs.",
    website: "https://www.kff.org",
    topicTags: ["Health", "Social Welfare", "Economics and Public Finance"],
    location: "National",
  },
  {
    name: "Families USA",
    mission:
      "Advocates for affordable healthcare access and patient protections nationwide.",
    website: "https://familiesusa.org",
    topicTags: ["Health", "Families", "Social Welfare"],
    location: "National",
  },
  {
    name: "American Public Health Association",
    mission:
      "Promotes public health policy and evidence-based prevention strategies.",
    website: "https://www.apha.org",
    topicTags: ["Health", "Environmental Protection", "Science, Technology, Communications"],
    location: "National",
  },
  {
    name: "Partnership for Public Service",
    mission:
      "Strengthens the federal workforce and improves government management capacity.",
    website: "https://ourpublicservice.org",
    topicTags: ["Government Operations and Politics", "Labor and Employment"],
    location: "National",
  },
  {
    name: "GovLoop",
    mission:
      "Supports public-sector professionals with training and federal operations best practices.",
    website: "https://www.govloop.com",
    topicTags: ["Government Operations and Politics", "Science, Technology, Communications"],
    location: "National",
  },
  {
    name: "National League of Cities",
    mission:
      "Represents municipal governments on transportation, housing, and fiscal policy.",
    website: "https://www.nlc.org",
    topicTags: ["Housing and Community Development", "Transportation and Public Works", "Economics and Public Finance"],
    location: "National",
  },
  {
    name: "U.S. Conference of Mayors",
    mission:
      "Advocates for city priorities including infrastructure, public safety, and housing.",
    website: "https://www.usmayors.org",
    topicTags: ["Transportation and Public Works", "Housing and Community Development", "Crime and Law Enforcement"],
    location: "National",
  },
  {
    name: "National Governors Association",
    mission:
      "Coordinates bipartisan state policy priorities across healthcare, education, and infrastructure.",
    website: "https://www.nga.org",
    topicTags: ["Government Operations and Politics", "Health", "Transportation and Public Works"],
    location: "National",
  },
  {
    name: "American Council for an Energy-Efficient Economy",
    mission:
      "Advances policy solutions for energy efficiency in buildings, transportation, and industry.",
    website: "https://www.aceee.org",
    topicTags: ["Energy", "Transportation and Public Works", "Environmental Protection"],
    location: "National",
  },
  {
    name: "R Street Institute",
    mission:
      "Develops policy on technology governance, insurance markets, and criminal justice reform.",
    website: "https://www.rstreet.org",
    topicTags: ["Science, Technology, Communications", "Finance and Financial Sector", "Crime and Law Enforcement"],
    location: "National",
  },
  {
    name: "Data Foundation",
    mission:
      "Promotes federal data quality, statistical capacity, and evidence-based policymaking.",
    website: "https://www.datafoundation.org",
    topicTags: ["Science, Technology, Communications", "Government Operations and Politics"],
    location: "National",
  },
  {
    name: "Open Technology Institute",
    mission:
      "Advocates for broadband access, digital rights, and open internet policy.",
    website: "https://www.newamerica.org/oti",
    topicTags: ["Science, Technology, Communications", "Civil Rights and Liberties, Minority Issues"],
    location: "National",
  },
  {
    name: "Information Technology and Innovation Foundation",
    mission:
      "Researches technology competitiveness, innovation policy, and digital economy growth.",
    website: "https://itif.org",
    topicTags: ["Science, Technology, Communications", "Commerce", "Labor and Employment"],
    location: "National",
  },
  {
    name: "American Society of Civil Engineers",
    mission:
      "Assesses infrastructure condition and advances long-term investment policy.",
    website: "https://www.asce.org",
    topicTags: ["Transportation and Public Works", "Water Resources Development", "Energy"],
    location: "National",
  },
  {
    name: "National Rural Electric Cooperative Association",
    mission:
      "Represents electric cooperatives and supports grid reliability and rural energy policy.",
    website: "https://www.electric.coop",
    topicTags: ["Energy", "Agriculture and Food", "Public Lands and Natural Resources"],
    location: "National",
  },
  {
    name: "Mercatus Center",
    mission:
      "Researches regulatory reform, economic growth, and federal administrative policy.",
    website: "https://www.mercatus.org",
    topicTags: ["Government Operations and Politics", "Economics and Public Finance", "Commerce"],
    location: "National",
  },
  {
    name: "National Consumer Law Center",
    mission:
      "Advances consumer financial protections for low-income households through litigation and policy advocacy.",
    website: "https://www.nclc.org",
    topicTags: ["Finance and Financial Sector", "Civil Rights and Liberties, Minority Issues", "Housing and Community Development"],
    location: "National",
  },
  {
    name: "Campaign Legal Center",
    mission:
      "Works on voting rights, campaign finance, and government ethics enforcement.",
    website: "https://campaignlegal.org",
    topicTags: ["Civil Rights and Liberties, Minority Issues", "Government Operations and Politics", "Congress"],
    location: "National",
  },
  {
    name: "VoteRiders",
    mission:
      "Helps voters access required identification and navigate election rules.",
    website: "https://www.voteriders.org",
    topicTags: ["Civil Rights and Liberties, Minority Issues", "Government Operations and Politics"],
    location: "National",
  },
  {
    name: "Partnership for Maternal and Child Health",
    mission:
      "Supports maternal and child health policy with a focus on access and prevention.",
    website: "https://example.org/maternal-child-health",
    topicTags: ["Health", "Families", "Social Welfare"],
    location: "National",
  },
  {
    name: "National Council of Nonprofits",
    mission:
      "Strengthens nonprofit organizations and policy conditions for community services.",
    website: "https://www.councilofnonprofits.org",
    topicTags: ["Social Welfare", "Economics and Public Finance", "Government Operations and Politics"],
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
