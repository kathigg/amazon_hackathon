import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

const accountSchemaStatements = [
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "topicTagsSource" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "fullTextUrl" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "latestActionAt" TIMESTAMP(3)`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageThumbnailUrl" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageTitle" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imagePageUrl" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageCreator" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageCreatorUrl" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageLicense" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageLicenseVersion" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageSource" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageSearchQuery" TEXT`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "imageFetchedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "viewCount" INTEGER DEFAULT 0`,
  `UPDATE "Bill" SET "viewCount" = 0 WHERE "viewCount" IS NULL`,
  `ALTER TABLE "Bill" ALTER COLUMN "viewCount" SET DEFAULT 0`,
  `ALTER TABLE "Bill" ALTER COLUMN "viewCount" SET NOT NULL`,
  `ALTER TABLE "Bill" ADD COLUMN IF NOT EXISTS "breakingAt" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "Bill_latestActionAt_idx" ON "Bill"("latestActionAt")`,
  `ALTER TABLE "Summary" ADD COLUMN IF NOT EXISTS "whyItMatters" TEXT DEFAULT ''`,
  `UPDATE "Summary" SET "whyItMatters" = '' WHERE "whyItMatters" IS NULL`,
  `ALTER TABLE "Summary" ALTER COLUMN "whyItMatters" SET DEFAULT ''`,
  `ALTER TABLE "Summary" ALTER COLUMN "whyItMatters" SET NOT NULL`,
  `ALTER TABLE "Summary" ADD COLUMN IF NOT EXISTS "aiProvider" TEXT`,
  `ALTER TABLE "Summary" ADD COLUMN IF NOT EXISTS "aiModel" TEXT`,
  `ALTER TABLE "Summary" ADD COLUMN IF NOT EXISTS "flagCount" INTEGER DEFAULT 0`,
  `UPDATE "Summary" SET "flagCount" = 0 WHERE "flagCount" IS NULL`,
  `ALTER TABLE "Summary" ALTER COLUMN "flagCount" SET DEFAULT 0`,
  `ALTER TABLE "Summary" ALTER COLUMN "flagCount" SET NOT NULL`,
  `ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "location" TEXT`,
  `CREATE TABLE IF NOT EXISTS "Representative" (
    "id" TEXT NOT NULL,
    "bioguideId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "chamber" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "websiteUrl" TEXT,
    "phone" TEXT,
    "officeAddress" TEXT,
    "photoUrl" TEXT,
    "lastScraped" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Representative_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT`,
  `ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "phone" TEXT`,
  `ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "officeAddress" TEXT`,
  `ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT`,
  `ALTER TABLE "Representative" ADD COLUMN IF NOT EXISTS "lastScraped" TIMESTAMP(3)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Representative_bioguideId_key" ON "Representative"("bioguideId")`,
  `CREATE TABLE IF NOT EXISTS "RepStance" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "stance" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "reasoning" TEXT,
    "source" TEXT NOT NULL DEFAULT 'scraped',
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepStance_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "RepStance" ADD COLUMN IF NOT EXISTS "confidence" DOUBLE PRECISION DEFAULT 0.5`,
  `UPDATE "RepStance" SET "confidence" = 0.5 WHERE "confidence" IS NULL`,
  `ALTER TABLE "RepStance" ALTER COLUMN "confidence" SET DEFAULT 0.5`,
  `ALTER TABLE "RepStance" ALTER COLUMN "confidence" SET NOT NULL`,
  `ALTER TABLE "RepStance" ADD COLUMN IF NOT EXISTS "reasoning" TEXT`,
  `ALTER TABLE "RepStance" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'scraped'`,
  `UPDATE "RepStance" SET "source" = 'scraped' WHERE "source" IS NULL`,
  `ALTER TABLE "RepStance" ALTER COLUMN "source" SET DEFAULT 'scraped'`,
  `ALTER TABLE "RepStance" ALTER COLUMN "source" SET NOT NULL`,
  `ALTER TABLE "RepStance" ADD COLUMN IF NOT EXISTS "scrapedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP`,
  `UPDATE "RepStance" SET "scrapedAt" = CURRENT_TIMESTAMP WHERE "scrapedAt" IS NULL`,
  `ALTER TABLE "RepStance" ALTER COLUMN "scrapedAt" SET DEFAULT CURRENT_TIMESTAMP`,
  `ALTER TABLE "RepStance" ALTER COLUMN "scrapedAt" SET NOT NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RepStance_repId_billId_key" ON "RepStance"("repId", "billId")`,
  `CREATE INDEX IF NOT EXISTS "RepStance_billId_idx" ON "RepStance"("billId")`,
  `CREATE INDEX IF NOT EXISTS "RepStance_stance_idx" ON "RepStance"("stance")`,
  `CREATE TABLE IF NOT EXISTS "ScrapedContent" (
    "id" TEXT NOT NULL,
    "repId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scrapedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScrapedContent_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE INDEX IF NOT EXISTS "ScrapedContent_repId_idx" ON "ScrapedContent"("repId")`,
  `CREATE INDEX IF NOT EXISTS "ScrapedContent_scrapedAt_idx" ON "ScrapedContent"("scrapedAt")`,
  `CREATE TABLE IF NOT EXISTS "PageView" (
    "id" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
  )`,
  `ALTER TABLE "PageView" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `CREATE INDEX IF NOT EXISTS "PageView_path_idx" ON "PageView"("path")`,
  `CREATE INDEX IF NOT EXISTS "PageView_createdAt_idx" ON "PageView"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "PageView_userId_idx" ON "PageView"("userId")`,
  `CREATE TABLE IF NOT EXISTS "ZipDistrict" (
    "id" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "stateCode" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ZipDistrict_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ZipDistrict_zip_stateCode_district_key" ON "ZipDistrict"("zip", "stateCode", "district")`,
  `CREATE INDEX IF NOT EXISTS "ZipDistrict_zip_idx" ON "ZipDistrict"("zip")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "interestSelections" TEXT[] DEFAULT ARRAY[]::TEXT[]`,
  `UPDATE "User" SET "interestSelections" = ARRAY[]::TEXT[] WHERE "interestSelections" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "interestSelections" SET DEFAULT ARRAY[]::TEXT[]`,
  `ALTER TABLE "User" ALTER COLUMN "interestSelections" SET NOT NULL`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailSubscriptions" TEXT[] DEFAULT ARRAY['weekly']::TEXT[]`,
  `UPDATE "User" SET "emailSubscriptions" = ARRAY['weekly']::TEXT[] WHERE "emailSubscriptions" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "emailSubscriptions" SET DEFAULT ARRAY['weekly']::TEXT[]`,
  `ALTER TABLE "User" ALTER COLUMN "emailSubscriptions" SET NOT NULL`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "topicWeights" JSONB DEFAULT '{}'::jsonb`,
  `UPDATE "User" SET "topicWeights" = '{}'::jsonb WHERE "topicWeights" IS NULL`,
  `ALTER TABLE "User" ALTER COLUMN "topicWeights" SET DEFAULT '{}'::jsonb`,
  `ALTER TABLE "User" ALTER COLUMN "topicWeights" SET NOT NULL`,
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
let accountSchemaSettled = false;

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
  if (process.env.ENABLE_RUNTIME_SCHEMA_REPAIR !== "true") {
    return;
  }

  if (accountSchemaSettled) {
    return;
  }

  if (!accountSchemaPromise) {
    accountSchemaPromise = applyAccountSchema()
      .catch((error) => {
        console.warn("Account schema check skipped:", error);
      })
      .finally(() => {
        accountSchemaSettled = true;
      });
  }

  await accountSchemaPromise;
}
