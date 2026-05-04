import { prisma } from "../prisma";

export const DEFAULT_REPRESENTATIVES_TO_SCRAPE = Number(
  process.env.REPRESENTATIVE_SCRAPE_LIMIT ?? 535
);
export const DEFAULT_RECENT_BILLS_TO_ANALYZE = Number(
  process.env.RECENT_BILL_ANALYSIS_LIMIT ?? 20
);

export interface RepresentativeScrapeTarget {
  id: string;
  firstName: string;
  lastName: string;
  party: string;
  state: string;
  websiteUrl: string;
}

export interface BillAnalysisTarget {
  id: string;
  title: string;
}

export async function selectRepresentativesToScrape(
  take = DEFAULT_REPRESENTATIVES_TO_SCRAPE
): Promise<RepresentativeScrapeTarget[]> {
  const representatives = await prisma.representative.findMany({
    where: { websiteUrl: { not: null } },
    take,
    orderBy: { lastScraped: "asc" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      party: true,
      state: true,
      websiteUrl: true,
    },
  });

  return representatives.flatMap((rep) =>
    rep.websiteUrl
      ? [
          {
            ...rep,
            websiteUrl: rep.websiteUrl,
          },
        ]
      : []
  );
}

export async function selectRecentBillsForStanceAnalysis(
  take = DEFAULT_RECENT_BILLS_TO_ANALYZE
): Promise<BillAnalysisTarget[]> {
  return prisma.bill.findMany({
    take,
    orderBy: { introducedAt: "desc" },
    select: { id: true, title: true },
  });
}
