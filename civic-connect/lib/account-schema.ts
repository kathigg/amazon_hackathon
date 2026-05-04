import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

const accountSchemaStatements = [
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailSubscriptions" TEXT[] DEFAULT ARRAY['weekly']::TEXT[]`,
  `UPDATE "User" SET "emailSubscriptions" = ARRAY['weekly']::TEXT[] WHERE "emailSubscriptions" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "emailSubscriptions" SET DEFAULT ARRAY['weekly']::TEXT[]`,
  `ALTER TABLE "User" ALTER COLUMN "emailSubscriptions" SET NOT NULL`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "timezone" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "zipCode" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "preferredRepBioguideIds" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
  `UPDATE "User" SET "preferredRepBioguideIds" = ARRAY[]::TEXT[] WHERE "preferredRepBioguideIds" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "preferredRepBioguideIds" SET DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE "User" ALTER COLUMN "preferredRepBioguideIds" SET NOT NULL`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "welcomeEmailSentAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardingDigestSentAt" TIMESTAMP(3)`,
  `CREATE TABLE IF NOT EXISTS "EmailDigestLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "localDateKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailDigestLog_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "EmailDigestLog_userId_createdAt_idx" ON "EmailDigestLog"("userId", "createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "EmailDigestLog_userId_kind_localDateKey_key" ON "EmailDigestLog"("userId", "kind", "localDateKey")`,
];

let accountSchemaPromise: Promise<void> | null = null;

function isOwnershipError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2010" &&
    error.meta?.code === "42501"
  );
}

function getOwnerDatabaseUrl() {
  const rawSecret = process.env.DATABASE_OWNER_SECRET_JSON;
  const host = process.env.DATABASE_OWNER_HOST;

  if (!rawSecret || !host) {
    return null;
  }

  try {
    const secret = JSON.parse(rawSecret) as {
      username?: string;
      password?: string;
    };

    if (!secret.username || !secret.password) {
      return null;
    }

    const url = new URL("postgresql://placeholder");
    url.username = secret.username;
    url.password = secret.password;
    url.hostname = host;
    url.port = process.env.DATABASE_OWNER_PORT || "5432";
    url.pathname = `/${process.env.DATABASE_OWNER_NAME || "neondb"}`;
    url.search = "schema=public&sslmode=require";

    return url.toString();
  } catch {
    return null;
  }
}

async function applyStatements(client: Pick<PrismaClient, "$executeRawUnsafe">) {
  for (const statement of accountSchemaStatements) {
    await client.$executeRawUnsafe(statement);
  }
}

async function applyAccountSchemaWithOwner() {
  const ownerDatabaseUrl = getOwnerDatabaseUrl();

  if (!ownerDatabaseUrl) {
    throw new Error("DATABASE_OWNER_SECRET_JSON and DATABASE_OWNER_HOST are required.");
  }

  const ownerPrisma = new PrismaClient({
    datasources: {
      db: {
        url: ownerDatabaseUrl,
      },
    },
  });

  try {
    await applyStatements(ownerPrisma);
  } finally {
    await ownerPrisma.$disconnect();
  }
}

async function applyAccountSchema() {
  try {
    await applyStatements(prisma);
  } catch (error) {
    if (!isOwnershipError(error)) {
      throw error;
    }

    await applyAccountSchemaWithOwner();
  }
}

export async function ensureAccountSchema() {
  if (!accountSchemaPromise) {
    accountSchemaPromise = applyAccountSchema().catch((error) => {
      accountSchemaPromise = null;
      throw error;
    });
  }

  await accountSchemaPromise;
}
