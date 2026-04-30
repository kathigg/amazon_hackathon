import { NextResponse } from "next/server";
import { logoutCurrentUser } from "@/lib/user-tracking";

export async function POST() {
  try {
    logoutCurrentUser();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Account logout error:", error);
    return NextResponse.json(
      { error: "Failed to log you out." },
      { status: 500 }
    );
  }
}
