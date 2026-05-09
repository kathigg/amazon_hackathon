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

export interface BillLaw {
  number: string;
  type: string;
}

export interface BillDetail {
  sponsor: string;
  policyArea: string | null;
  subjects: string[];
  introducedDate: string | null;
  latestActionDate: string | null;
  latestActionTime: string | null;
  laws: BillLaw[];
  updateDate: string | null;
  originChamber: "House" | "Senate" | null;
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
  const rawLaws: Array<{ number?: string; type?: string }> = data.bill?.laws ?? [];
  const laws: BillLaw[] = rawLaws
    .filter((l) => l.number && l.type)
    .map((l) => ({ number: String(l.number), type: String(l.type) }));
  const rawOrigin = data.bill?.originChamber;
  const originChamber: "House" | "Senate" | null =
    rawOrigin === "House" || rawOrigin === "Senate" ? rawOrigin : null;
  return {
    sponsor: sponsor || "Unknown",
    policyArea,
    subjects,
    introducedDate: data.bill?.introducedDate ?? null,
    latestActionDate: data.bill?.latestAction?.actionDate ?? null,
    latestActionTime: data.bill?.latestAction?.actionTime ?? null,
    laws,
    updateDate: data.bill?.updateDate ?? null,
    originChamber,
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

export interface BillSummary {
  versionCode: string;
  actionDate: string;
  actionDesc: string;
}

export async function fetchBillSummaries(
  congress: number,
  type: string,
  number: string
): Promise<BillSummary[]> {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}/summaries?api_key=${getKey()}&format=json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  const summaries: Array<{
    versionCode?: string;
    actionDate?: string;
    actionDesc?: string;
  }> = data.summaries ?? [];
  return summaries
    .filter((s) => s.versionCode && s.actionDate)
    .map((s) => ({
      versionCode: String(s.versionCode),
      actionDate: String(s.actionDate),
      actionDesc: s.actionDesc ?? "",
    }));
}

export interface BillAction {
  actionDate: string;
  type: string | null;
  actionCode: string | null;
  text: string;
  recordedVotes?: Array<{ chamber: string; rollNumber: number; sessionNumber: number }>;
}

export async function fetchBillActions(
  congress: number,
  type: string,
  number: string,
  limit = 250
): Promise<BillAction[]> {
  const url = `${BASE}/bill/${congress}/${type.toLowerCase()}/${number}/actions?api_key=${getKey()}&format=json&limit=${limit}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = await res.json();
  const actions: Array<{
    actionDate?: string;
    type?: string;
    actionCode?: string;
    text?: string;
    recordedVotes?: Array<{ chamber: string; rollNumber: number; sessionNumber: number }>;
  }> = data.actions ?? [];
  return actions
    .filter((a) => a.actionDate)
    .map((a) => ({
      actionDate: String(a.actionDate),
      type: a.type ?? null,
      actionCode: a.actionCode ?? null,
      text: a.text ?? "",
      recordedVotes: a.recordedVotes,
    }));
}
