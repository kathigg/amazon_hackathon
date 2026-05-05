import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function getPrismaDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;

  if (!rawUrl) {
    return undefined;
  }

  try {
    const url = new URL(rawUrl);

    if (!url.searchParams.has("connect_timeout")) {
      url.searchParams.set("connect_timeout", "3");
    }

    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", "3");
    }

    if (!url.searchParams.has("socket_timeout")) {
      url.searchParams.set("socket_timeout", "5");
    }

    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", "5");
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ["error"],
    datasources: {
      db: {
        url: getPrismaDatabaseUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
