import { NextRequest, NextResponse } from "next/server";
import {
  getOrCreateUserId,
  trackBillView,
  updateTopicWeights,
} from "@/lib/user-tracking";

export async function POST(req: NextRequest) {
  try {
    const { billId, topics, timeSpent, scrollDepth } = await req.json();

    const userId = await getOrCreateUserId();

    await trackBillView(userId, billId, timeSpent, scrollDepth);

    if (topics && topics.length > 0) {
      await updateTopicWeights(userId, topics);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Bill view tracking error:", error);
    return NextResponse.json({ error: "Failed to track" }, { status: 500 });
  }
}
