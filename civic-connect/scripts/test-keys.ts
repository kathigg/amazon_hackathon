#!/usr/bin/env tsx
/**
 * Test API keys
 * Run with: npx tsx scripts/test-keys.ts
 */

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

async function testKeys() {
  console.log("🔑 Testing API keys...\n");

  // Check environment variables
  const requiredKeys = {
    "DATABASE_URL": process.env.DATABASE_URL,
    "CONGRESS_API_KEY": process.env.CONGRESS_API_KEY,
    "GOOGLE_GEMINI_KEY": process.env.GOOGLE_GEMINI_KEY,
    "GOOGLE_CIVIC_API_KEY": process.env.GOOGLE_CIVIC_API_KEY,
    "INGEST_SECRET": process.env.INGEST_SECRET,
    "AI_PROVIDER": process.env.AI_PROVIDER,
    "AI_MODEL": process.env.AI_MODEL,
  };

  let allPresent = true;
  for (const [key, value] of Object.entries(requiredKeys)) {
    if (value) {
      console.log(`✅ ${key}: Set (${value.substring(0, 20)}...)`);
    } else {
      console.log(`❌ ${key}: Missing!`);
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.log("\n⚠️  Some keys are missing. Check your .env.local file.");
    process.exit(1);
  }

  console.log("\n🧪 Testing Congress.gov API...");
  try {
    const response = await fetch(
      "https://api.congress.gov/v3/bill/119?api_key=" + process.env.CONGRESS_API_KEY
    );
    if (response.ok) {
      console.log("✅ Congress API key works!");
      const data = await response.json();
      console.log(`   Found ${data.bills?.length || 0} bills in response`);
    } else {
      console.log(`❌ Congress API failed: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    console.log(`❌ Congress API error: ${error.message}`);
  }

  console.log("\n🧪 Testing Google Gemini API...");
  try {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_KEY!);
    const model = genAI.getGenerativeModel({ model: process.env.AI_MODEL || "gemini-2.0-flash" });
    
    const result = await model.generateContent("Say 'API works' in 2 words");
    const text = result.response.text();
    console.log(`✅ Gemini API works! Response: "${text}"`);
  } catch (error: any) {
    console.log(`❌ Gemini API error: ${error.message}`);
  }

  console.log("\n🧪 Testing Google Civic API...");
  try {
    const response = await fetch(
      `https://www.googleapis.com/civicinfo/v2/representatives?address=1600+Pennsylvania+Ave+NW+Washington+DC&key=${process.env.GOOGLE_CIVIC_API_KEY}`
    );
    if (response.ok) {
      console.log("✅ Google Civic API key works!");
      const data = await response.json();
      console.log(`   Found ${data.officials?.length || 0} officials`);
    } else {
      console.log(`❌ Google Civic API failed: ${response.status} ${response.statusText}`);
      const error = await response.text();
      console.log(`   Error: ${error.substring(0, 100)}`);
    }
  } catch (error: any) {
    console.log(`❌ Google Civic API error: ${error.message}`);
  }

  console.log("\n✅ Key testing complete!");
}

testKeys();
