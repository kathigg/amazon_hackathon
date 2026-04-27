import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Total users
    const totalUsers = await prisma.user.count();
    const activeUsers24h = await prisma.user.count({
      where: { lastSeen: { gte: last24h } },
    });
    const activeUsers7d = await prisma.user.count({
      where: { lastSeen: { gte: last7d } },
    });

    // Session stats
    const sessions = await prisma.session.findMany({
      where: { startTime: { gte: last30d } },
      select: {
        startTime: true,
        endTime: true,
        pageCount: true,
        billsRead: true,
      },
    });

    const avgSessionDuration =
      sessions
        .filter((s) => s.endTime)
        .reduce((sum, s) => {
          const duration = s.endTime!.getTime() - s.startTime.getTime();
          return sum + duration;
        }, 0) / sessions.length || 0;

    const avgBillsPerSession =
      sessions.reduce((sum, s) => sum + s.billsRead, 0) / sessions.length || 0;

    // Most viewed bills
    const topBills = await prisma.billView.groupBy({
      by: ["billId"],
      _count: { billId: true },
      _avg: { timeSpent: true },
      orderBy: { _count: { billId: "desc" } },
      take: 10,
    });

    // Page views over time (last 30 days)
    const pageViewsByDay = await prisma.$queryRaw<
      Array<{ date: string; count: bigint }>
    >`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as count
      FROM "PageView"
      WHERE created_at >= ${last30d}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // Most popular topics
    const allUsers = await prisma.user.findMany({
      select: { topicWeights: true },
    });

    const topicTotals: Record<string, number> = {};
    for (const user of allUsers) {
      const weights = user.topicWeights as Record<string, number>;
      for (const [topic, weight] of Object.entries(weights)) {
        topicTotals[topic] = (topicTotals[topic] || 0) + weight;
      }
    }

    const topTopics = Object.entries(topicTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([topic, count]) => ({ topic, count }));

    return NextResponse.json({
      overview: {
        totalUsers,
        activeUsers24h,
        activeUsers7d,
        avgSessionDuration: Math.round(avgSessionDuration / 1000), // seconds
        avgBillsPerSession: Math.round(avgBillsPerSession * 10) / 10,
      },
      topBills: topBills.map((b) => ({
        billId: b.billId,
        views: Number(b._count.billId),
        avgTimeSpent: Math.round(b._avg.timeSpent || 0),
      })),
      pageViewsByDay: pageViewsByDay.map((d) => ({
        date: d.date,
        count: Number(d.count),
      })),
      topTopics,
    });
  } catch (error) {
    console.error("Analytics dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch analytics" }, { status: 500 });
  }
}
