const BASE = "https://api.congress.gov/v3";
function getKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

export interface CongressBill {
  congress: number;
  number: string;
  type: string;
  title: string;
  latestAction: { text: string; actionDate: string; actionTime?: string };
  sponsors?: Array<{ fullName: string }>;
  url: string;
}

export async function fetchRecentBills(
  congress = 119,
  limit = 20,
  offset = 0
): Promise<CongressBill[]> {
  const url = `${BASE}/bill/${congress}?limit=${limit}&offset=${offset}&api_key=${getKey()}&format=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Congress API error: ${res.status}`);
  const data = await res.json();
  return data.bills ?? [];
}

export interface BillDetail {
  sponsor: string;
  policyArea: string | null;
  subjects: string[];
  introducedDate: string | null;
  latestActionDate: string | null;
  latestActionTime: string | null;
}

export async function fetchBillDetail(
  congress: number,
  type: string,
  number: string
): Promise<BillDetail | null> {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}?api_key=${getKey()}&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = await res.json();
  const s = data.bill?.sponsors?.[0];
  const sponsor = s ? `${s.firstName ?? ""} ${s.lastName ?? ""}`.trim() : null;
  const policyArea: string | null = data.bill?.policyArea?.name ?? null;
  const rawSubjects: Array<{ name?: string }> =
    data.bill?.subjects?.legislativeSubjects ?? [];
  const subjects = rawSubjects
    .map((entry) => entry.name)
    .filter((name): name is string => Boolean(name));
  return {
    sponsor: sponsor || "Unknown",
    policyArea,
    subjects,
    introducedDate: data.bill?.introducedDate ?? null,
    latestActionDate: data.bill?.latestAction?.actionDate ?? null,
    latestActionTime: data.bill?.latestAction?.actionTime ?? null,
  };
}

export interface CosponsorTally {
  democratic: number;
  republican: number;
  independent: number;
  total: number;
}

export async function fetchCosponsors(
  congress: number,
  type: string,
  number: string
): Promise<CosponsorTally> {
  const tally: CosponsorTally = { democratic: 0, republican: 0, independent: 0, total: 0 };
  let offset = 0;
  const limit = 250;

  // Page through all cosponsors (bills can have hundreds)
  while (true) {
    const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}/cosponsors?api_key=${getKey()}&format=json&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) break;
    const data = await res.json();
    const cosponsors: Array<{ party: string }> = data.cosponsors ?? [];
    if (cosponsors.length === 0) break;

    for (const c of cosponsors) {
      const p = c.party?.toUpperCase();
      if (p === "D") tally.democratic++;
      else if (p === "R") tally.republican++;
      else tally.independent++;
      tally.total++;
    }

    if (cosponsors.length < limit) break;
    offset += limit;
  }

  return tally;
}

export async function fetchBillText(
  congress: number,
  type: string,
  number: string
): Promise<string | null> {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}/text?api_key=${getKey()}&format=json`;
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) return null;
  const data = await res.json();
  // Return the URL of the latest text version for downstream fetching
  const versions = data.textVersions ?? [];
  return versions[0]?.formats?.find((f: { type: string; url: string }) => f.type === "Formatted Text")?.url ?? null;
}
