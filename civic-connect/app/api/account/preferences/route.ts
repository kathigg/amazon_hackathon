import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { saveUserPreferences, getCurrentUser } from "@/lib/user-tracking";

const preferencesSchema = z.object({
  zipCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Enter a valid 5-digit ZIP code.")
    .optional()
    .or(z.literal("")),
  preferredRepBioguideIds: z.array(z.string().trim()).max(6).default([]),
});

export async function GET() {
  const user = await getCurrentUser().catch(() => null);

  return NextResponse.json({
    preferredRepBioguideIds: user?.preferredRepBioguideIds ?? [],
    zipCode: user?.zipCode ?? "",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = preferencesSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid preference details.",
        },
        { status: 400 }
      );
    }

    const user = await saveUserPreferences({
      zipCode: parsed.data.zipCode || undefined,
      preferredRepBioguideIds: parsed.data.preferredRepBioguideIds,
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("Account preference save error:", error);
    return NextResponse.json(
      { error: "Failed to save your representative preferences." },
      { status: 500 }
    );
  }
}
