import { NextResponse } from "next/server";
import { ensureAccountSchema } from "@/lib/account-schema";
import { prisma } from "@/lib/prisma";

const MAX_HEALTH_ATTEMPTS = 3;
const HEALTH_RETRY_DELAY_MS = 250;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDatabase() {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= MAX_HEALTH_ATTEMPTS; attempt += 1) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { ok: true as const, attempts: attempt };
    } catch (error) {
      lastError = error;

      if (attempt < MAX_HEALTH_ATTEMPTS) {
        await delay(HEALTH_RETRY_DELAY_MS);
      }
    }
  }

  return {
    ok: false as const,
    attempts: MAX_HEALTH_ATTEMPTS,
    error:
      lastError instanceof Error
        ? lastError.message
        : "Database connection failed.",
  };
}

export async function GET() {
  await ensureAccountSchema();

  const database = await checkDatabase();

  if (!database.ok) {
    return NextResponse.json({
      status: "error",
      message: database.error,
      database: "disconnected",
      attempts: database.attempts,
    }, { status: 500 });
  }

  return NextResponse.json({
    status: "ok",
    database: "connected",
    attempts: database.attempts,
    timestamp: new Date().toISOString(),
  });
}
