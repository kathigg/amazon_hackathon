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

async function applyAccountSchema() {
  for (const statement of accountSchemaStatements) {
    await prisma.$executeRawUnsafe(statement);
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
