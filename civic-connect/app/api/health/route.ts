import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Test database connection
    await prisma.$connect();
    
    // Count records
    const [billCount, summaryCount, orgCount] = await Promise.all([
      prisma.bill.count(),
      prisma.summary.count(),
      prisma.organization.count(),
    ]);

    // Get a sample bill if any exist
    const sampleBill = await prisma.bill.findFirst({
      include: { summary: true }
    });

    return NextResponse.json({
      status: "ok",
      database: "connected",
      counts: {
        bills: billCount,
        summaries: summaryCount,
        organizations: orgCount,
      },
      sampleBill: sampleBill ? {
        id: sampleBill.id,
        title: sampleBill.title.substring(0, 60) + "...",
        hasSummary: !!sampleBill.summary,
      } : null,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      message: error.message,
      database: "disconnected",
    }, { status: 500 });
  }
}
