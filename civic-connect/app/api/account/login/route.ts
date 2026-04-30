import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loginWithEmail } from "@/lib/user-tracking";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid email." },
        { status: 400 }
      );
    }

    const user = await loginWithEmail(parsed.data.email);

    if (!user) {
      return NextResponse.json(
        { error: "No account was found for that email." },
        { status: 404 }
      );
    }

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Account login error:", error);
    return NextResponse.json(
      { error: "Failed to log you in." },
      { status: 500 }
    );
  }
}
