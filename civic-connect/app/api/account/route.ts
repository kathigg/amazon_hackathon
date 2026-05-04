import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AccountConflictError,
  saveAccountProfile,
} from "@/lib/user-tracking";
import { sanitizeInterestSelections } from "@/lib/account-interests";
import { sanitizeEmailSubscriptions } from "@/lib/email-preferences";

const accountSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  interestSelections: z
    .array(z.string())
    .min(1, "Pick at least one issue before continuing."),
  emailSubscriptions: z.array(z.string()).default(["weekly"]),
  timezone: z.string().trim().optional(),
  zipCode: z.string().trim().regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code.").optional().or(z.literal("")),
  preferredRepBioguideIds: z.array(z.string().trim()).max(6).default([]),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = accountSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid account details." },
        { status: 400 }
      );
    }

    const interestSelections = sanitizeInterestSelections(
      parsed.data.interestSelections
    );
    const emailSubscriptions = sanitizeEmailSubscriptions(
      parsed.data.emailSubscriptions
    );

    if (interestSelections.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one issue before continuing." },
        { status: 400 }
      );
    }

    const user = await saveAccountProfile({
      email: parsed.data.email,
      interestSelections,
      emailSubscriptions,
      timezone: parsed.data.timezone,
      zipCode: parsed.data.zipCode || undefined,
      preferredRepBioguideIds: parsed.data.preferredRepBioguideIds,
    });

    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AccountConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error("Account save error:", error);
    return NextResponse.json(
      { error: "Failed to save your account." },
      { status: 500 }
    );
  }
}
