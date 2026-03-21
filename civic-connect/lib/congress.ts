const BASE = "https://api.congress.gov/v3";
const KEY = process.env.CONGRESS_API_KEY!;

export interface CongressBill {
  congress: number;
  number: string;
  type: string;
  title: string;
  introducedDate: string;
  latestAction: { text: string; actionDate: string };
  sponsors?: Array<{ fullName: string }>;
  url: string;
}

export async function fetchRecentBills(
  congress = 119,
  limit = 250,
  offset = 0
): Promise<CongressBill[]> {
  const url = `${BASE}/bill/${congress}?limit=${limit}&offset=${offset}&api_key=${KEY}&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Congress API error: ${res.status}`);
  const data = await res.json();
  return data.bills ?? [];
}

export async function fetchBillText(
  congress: number,
  type: string,
  number: string
): Promise<string | null> {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}/text?api_key=${KEY}&format=json`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const data = await res.json();
  // Return the URL of the latest text version for downstream fetching
  const versions = data.textVersions ?? [];
  return versions[0]?.formats?.find((f: { type: string; url: string }) => f.type === "Formatted Text")?.url ?? null;
}
