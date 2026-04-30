#!/usr/bin/env tsx
/**
 * Seed representatives from Congress.gov API
 */

import { prisma } from "../lib/prisma";
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
  chamber: string;
  websiteUrl: string | null;
}

async function fetchMembers(): Promise<CongressMember[]> {
  const allMembers: CongressMember[] = [];
  let offset = 0;
  const limit = 250;
  
  console.log("Fetching member list...");
  
  while (true) {
    const url = `https://api.congress.gov/v3/member/congress/119?api_key=${CONGRESS_API_KEY}&limit=${limit}&offset=${offset}&format=json`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Congress API error: ${response.status}`);
    }

    const data = await response.json();
    const members = data.members || [];
    
    if (members.length === 0) break;

    // Fetch full details for each member to get website URL
    for (const m of members) {
      try {
        const detailUrl = `${m.url}&api_key=${CONGRESS_API_KEY}`;
        const detailResponse = await fetch(detailUrl);
        
        if (!detailResponse.ok) {
          console.warn(`Failed to fetch details for ${m.bioguideId}`);
          continue;
        }
        
        const detailData = await detailResponse.json();
        const memberDetail = detailData.member;
        
        // Get the most recent term to determine current chamber
        const terms = memberDetail.terms || [];
        const currentTerm = terms[terms.length - 1];
        const chamber = currentTerm?.chamber === "Senate" ? "senate" : "house";
        
        allMembers.push({
          bioguideId: memberDetail.bioguideId,
          firstName: memberDetail.firstName || "",
          lastName: memberDetail.lastName || "",
          party: memberDetail.partyHistory?.[0]?.partyAbbreviation || "I",
          state: memberDetail.state || "",
          district: currentTerm?.district?.toString(),
          chamber,
          websiteUrl: memberDetail.officialWebsiteUrl || null,
        });
        
        // Rate limiting - be nice to the API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.warn(`Error fetching details for ${m.bioguideId}:`, error);
      }
    }
    
    offset += limit;
    
    // Break if we got fewer results than the limit (last page)
    if (members.length < limit) break;
  }

  return allMembers;
}

async function seedRepresentatives() {
  console.log("🏛️  Seeding representatives...\n");

  try {
    // Fetch all members of 119th Congress
    console.log("Fetching members of 119th Congress...");
    const allMembers = await fetchMembers();
    
    const houseMembers = allMembers.filter(m => m.chamber === "house");
    const senateMembers = allMembers.filter(m => m.chamber === "senate");
    
    console.log(`Found ${houseMembers.length} House members`);
    console.log(`Found ${senateMembers.length} Senate members`);
    console.log(`Total: ${allMembers.length}\n`);

    let created = 0;
    let updated = 0;

    // Seed all members
    for (const member of allMembers) {
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
            chamber: member.chamber,
            websiteUrl: member.websiteUrl,
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
            chamber: member.chamber,
            state: member.state,
            district: member.district,
            websiteUrl: member.websiteUrl,
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
