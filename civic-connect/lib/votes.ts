/**
 * Vote data via Congress.gov API
 * Replaces the deprecated ProPublica Congress API
 */

const BASE = "https://api.congress.gov/v3";
function getKey() {
  const key = process.env.CONGRESS_API_KEY;
  if (!key) throw new Error("CONGRESS_API_KEY is not set");
  return key;
}

export interface VoteResult {
  democratic: { yes: number; no: number };
  republican: { yes: number; no: number };
}

export async function fetchBillVotes(
  congress: number,
  billType: string,
  billNumber: string
): Promise<VoteResult | null> {
  // Fetch recorded votes associated with this bill's actions
  const url = `${BASE}/bill/${congress}/${billType.toLowerCase()}/${billNumber}/actions?api_key=${getKey()}&format=json&limit=20`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) return null;

  const data = await res.json();
  const actions: Array<{ recordedVotes?: Array<{ chamber: string; rollNumber: number; sessionNumber: number }> }> =
    data.actions ?? [];

  // Find the most recent recorded vote
  const voteAction = actions.find((a) => a.recordedVotes && a.recordedVotes.length > 0);
  if (!voteAction?.recordedVotes?.length) return null;

  const { chamber, rollNumber, sessionNumber } = voteAction.recordedVotes[0];
  const chamberPath = chamber.toLowerCase() === "senate" ? "senate" : "house";

  const voteUrl = `${BASE}/congressional-record/${congress}/${chamberPath}/votes/${sessionNumber}/${rollNumber}?api_key=${getKey()}&format=json`;
  const voteRes = await fetch(voteUrl, { next: { revalidate: 3600 } });
  if (!voteRes.ok) return null;

  const voteData = await voteRes.json();
  const members: Array<{ party: string; votePosition: string }> =
    voteData.vote?.members ?? [];

  const tally = { democratic: { yes: 0, no: 0 }, republican: { yes: 0, no: 0 } };

  for (const m of members) {
    const party = m.party?.toUpperCase();
    const pos = m.votePosition?.toUpperCase();
    if (party === "D" && pos === "YEA") tally.democratic.yes++;
    else if (party === "D" && pos === "NAY") tally.democratic.no++;
    else if (party === "R" && pos === "YEA") tally.republican.yes++;
    else if (party === "R" && pos === "NAY") tally.republican.no++;
  }

  return tally;
}
