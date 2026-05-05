import { NextRequest, NextResponse } from "next/server";
import {
  getCurrentUserId,
  trackBillView,
  updateTopicWeights,
} from "@/lib/user-tracking";

export async function POST(req: NextRequest) {
  try {
    const { billId, topics, timeSpent, scrollDepth } = await req.json();

    if (!billId || typeof billId !== "string") {
      return NextResponse.json({ error: "Missing billId" }, { status: 400 });
    }

    const userId = await getCurrentUserId();

    await trackBillView(userId, billId, timeSpent, scrollDepth);

    if (userId && topics && topics.length > 0) {
      await updateTopicWeights(userId, topics);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bill view tracking error:", error);
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }
}
