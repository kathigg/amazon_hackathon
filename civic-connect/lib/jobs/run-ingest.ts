import {
  fetchBillsForMetadataIngest,
  upsertBillMetadataFromCongress,
} from "../bill-ingestion";

export const DEFAULT_INGEST_CONGRESS = 119;

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

  const results = await Promise.allSettled(
    bills.map((bill) => upsertBillMetadataFromCongress(bill))
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
