#!/usr/bin/env tsx
/**
 * Test database connection and check data
 * Run with: npx tsx scripts/test-db.ts
 */

import { prisma } from "../lib/prisma";

async function testDatabase() {
  console.log("🔍 Testing database connection...\n");

  try {
    // Test 1: Can we connect?
    await prisma.$connect();
    console.log("✅ Database connection successful!");
    console.log(`   Connected to: ${process.env.DATABASE_URL?.split("@")[1]?.split("?")[0] || "database"}\n`);

    // Test 2: Check if tables exist
    console.log("📊 Checking database tables...");
    const tableCheck = await prisma.$queryRaw`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `;
    console.log(`   Found ${Array.isArray(tableCheck) ? tableCheck.length : 0} tables`);
    if (Array.isArray(tableCheck) && tableCheck.length > 0) {
      console.log("   Tables:", tableCheck.map((t: any) => t.table_name).join(", "));
    } else {
      console.log("   ⚠️  No tables found! Run: npx prisma db push");
    }
    console.log();

    // Test 3: Count bills
    const billCount = await prisma.bill.count();
    console.log(`📄 Bills in database: ${billCount}`);
    if (billCount === 0) {
      console.log("   ⚠️  No bills found! Run: npm run ingest");
    } else {
      console.log("   ✅ Database has data!");
      
      // Show a sample bill
      const sampleBill = await prisma.bill.findFirst({
        include: { summary: true }
      });
      if (sampleBill) {
        console.log(`\n   Sample bill: ${sampleBill.id}`);
        console.log(`   Title: ${sampleBill.title.substring(0, 60)}...`);
        console.log(`   Has summary: ${sampleBill.summary ? "Yes" : "No"}`);
      }
    }
    console.log();

    // Test 4: Count other data
    const [summaryCount, orgCount, stanceCount] = await Promise.all([
      prisma.summary.count(),
      prisma.organization.count(),
      prisma.stance.count(),
    ]);
    console.log(`📝 Summaries: ${summaryCount}`);
    console.log(`🏢 Organizations: ${orgCount}`);
    console.log(`🗳️  Stances: ${stanceCount}`);
    console.log();

    console.log("✅ All checks complete!");

  } catch (error: any) {
    console.error("❌ Database error:", error.message);
    console.log("\n🔧 Troubleshooting:");
    console.log("   1. Check DATABASE_URL in .env.local");
    console.log("   2. Make sure Postgres is running");
    console.log("   3. Run: npx prisma db push");
    console.log("   4. Run: npm run ingest");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
