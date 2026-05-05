import {
  fetchBillsForMetadataIngest,
  upsertBillMetadataFromCongress,
} from "../bill-ingestion";

export const DEFAULT_INGEST_CONGRESS = 119;
const METADATA_INGEST_CONCURRENCY = 5;

export interface RunMetadataIngestOptions {
  congress?: number;
  limit?: number;
}

export interface MetadataIngestResult {
  ingested: number;
  skipped: number;
  breaking: number;
  total: number;
}

export async function runMetadataIngest(
  options: RunMetadataIngestOptions = {}
): Promise<MetadataIngestResult> {
  const congress = options.congress ?? DEFAULT_INGEST_CONGRESS;
  const bills = await fetchBillsForMetadataIngest(congress, options.limit);

  let ingested = 0;
  let skipped = 0;
  let breaking = 0;

  const results = await mapWithConcurrency(
    bills,
    METADATA_INGEST_CONCURRENCY,
    async (bill) => {
      try {
        return {
          status: "fulfilled" as const,
          value: await upsertBillMetadataFromCongress(bill),
        };
      } catch (error) {
        return {
          status: "rejected" as const,
          reason: error,
        };
      }
    }
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      ingested++;
      if (result.value.breakingTriggered) {
        breaking++;
      }
    } else {
      skipped++;
      console.error("Failed to ingest bill:", result.reason);
    }
  }

  return {
    ingested,
    skipped,
    breaking,
    total: bills.length,
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>
) {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  const runners = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (nextIndex < values.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await worker(values[currentIndex]);
      }
    }
  );

  await Promise.all(runners);
  return results;
}
