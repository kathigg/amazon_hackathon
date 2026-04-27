#!/usr/bin/env tsx
/**
 * Seed representatives from Congress.gov API
 */

import { prisma } from "../lib/prisma";
import { getRepresentativeWebsiteUrl } from "../lib/scraper";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;

interface CongressMember {
  bioguideId: string;
  firstName: string;
  lastName: string;
  party: string;
  state: string;
  district?: string;
}

async function fetchMembers(chamber: "house" | "senate"): Promise<CongressMember[]> {
  const url = `https://api.congress.gov/v3/member/${chamber}/119?api_key=${CONGRESS_API_KEY}&limit=250&format=json`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Congress API error: ${response.status}`);
  }

  const data = await response.json();
  const members = data.members || [];

  return members.map((m: any) => ({
    bioguideId: m.bioguideId,
    firstName: m.firstName || "",
    lastName: m.lastName || "",
    party: m.partyName?.charAt(0) || "I",
    state: m.state || "",
    district: m.district?.toString(),
  }));
}

async function seedRepresentatives() {
  console.log("🏛️  Seeding representatives...\n");

  try {
    // Fetch House members
    console.log("Fetching House members...");
    const houseMembers = await fetchMembers("house");
    console.log(`Found ${houseMembers.length} House members`);

    // Fetch Senate members
    console.log("Fetching Senate members...");
    const senateMembers = await fetchMembers("senate");
    console.log(`Found ${senateMembers.length} Senate members\n`);

    let created = 0;
    let updated = 0;

    // Seed House
    for (const member of houseMembers) {
      const websiteUrl = getRepresentativeWebsiteUrl("house", member.state, member.lastName);
      
      const existing = await prisma.representative.findUnique({
        where: { bioguideId: member.bioguideId },
      });

      if (existing) {
        await prisma.representative.update({
          where: { bioguideId: member.bioguideId },
          data: {
            firstName: member.firstName,
            lastName: member.lastName,
            party: member.party,
            state: member.state,
            district: member.district,
            websiteUrl,
          },
        });
        updated++;
      } else {
        await prisma.representative.create({
          data: {
            bioguideId: member.bioguideId,
            firstName: member.firstName,
            lastName: member.lastName,
            party: member.party,
            chamber: "house",
            state: member.state,
            district: member.district,
            websiteUrl,
          },
        });
        created++;
      }
    }

    // Seed Senate
    for (const member of senateMembers) {
      const websiteUrl = getRepresentativeWebsiteUrl("senate", member.state, member.lastName);
      
      const existing = await prisma.representative.findUnique({
        where: { bioguideId: member.bioguideId },
      });

      if (existing) {
        await prisma.representative.update({
          where: { bioguideId: member.bioguideId },
          data: {
            firstName: member.firstName,
            lastName: member.lastName,
            party: member.party,
            state: member.state,
            websiteUrl,
          },
        });
        updated++;
      } else {
        await prisma.representative.create({
          data: {
            bioguideId: member.bioguideId,
            firstName: member.firstName,
            lastName: member.lastName,
            party: member.party,
            chamber: "senate",
            state: member.state,
            websiteUrl,
          },
        });
        created++;
      }
    }

    console.log(`\n✅ Complete!`);
    console.log(`   Created: ${created}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Total: ${created + updated}`);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

seedRepresentatives();
