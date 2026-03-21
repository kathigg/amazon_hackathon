import { NextRequest, NextResponse } from "next/server";

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY!;
const BASE = "https://api.congress.gov/v3";

// ZIP → state code via free zippopotam.us (no key needed)
async function zipToState(zip: string): Promise<{ stateCode: string; stateName: string } | null> {
  const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!res.ok) return null;
  const data = await res.json();
  const place = data.places?.[0];
  if (!place) return null;
  return {
    stateCode: place["state abbreviation"],
    stateName: place["state"],
  };
}

interface CongressMember {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item: Array<{ chamber: string; startYear: number }> };
  url: string;
}

interface MemberDetail {
  officialWebsiteUrl?: string;
  addressInformation?: { phoneNumber?: string; officeAddress?: string };
  depiction?: { imageUrl?: string };
  directOrderName?: string;
  partyHistory?: Array<{ partyName: string }>;
}

async function fetchMemberDetail(bioguideId: string): Promise<MemberDetail> {
  const res = await fetch(
    `${BASE}/member/${bioguideId}?api_key=${CONGRESS_API_KEY}&format=json`
  );
  if (!res.ok) return {};
  const data = await res.json();
  return data.member ?? {};
}

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || zip.length !== 5) {
    return NextResponse.json({ error: "Valid 5-digit ZIP required" }, { status: 400 });
  }

  const location = await zipToState(zip);
  if (!location) {
    return NextResponse.json({ error: "Could not resolve ZIP code to a state." }, { status: 404 });
  }

  const { stateCode, stateName } = location;

  // Fetch current members for this state
  const res = await fetch(
    `${BASE}/member?stateCode=${stateCode}&currentMember=true&limit=50&api_key=${CONGRESS_API_KEY}&format=json`
  );
  if (!res.ok) {
    return NextResponse.json({ error: "Congress.gov API error" }, { status: 502 });
  }

  const data = await res.json();
  const members: CongressMember[] = data.members ?? [];

  // Separate senators and house members
  const senators = members.filter((m) =>
    m.terms?.item?.some((t) => t.chamber === "Senate")
  );
  const houseMembers = members.filter((m) =>
    m.terms?.item?.some((t) => t.chamber === "House of Representatives")
  );

  // Fetch details for senators (small number, always 2) + all house members
  const toDetail = [...senators, ...houseMembers];
  const details = await Promise.all(
    toDetail.map((m) => fetchMemberDetail(m.bioguideId))
  );

  const reps = toDetail.map((m, i) => {
    const detail = details[i];
    const chamber = m.terms?.item?.some((t) => t.chamber === "Senate")
      ? "Senate"
      : "House of Representatives";
    const party = detail.partyHistory?.[0]?.partyName ?? m.partyName ?? "Unknown";
    const districtLabel = m.district ? ` — District ${m.district}` : "";

    return {
      bioguideId: m.bioguideId,
      name: detail.directOrderName ?? m.name,
      party,
      chamber,
      office: `${stateName} · ${chamber}${districtLabel}`,
      photoUrl: detail.depiction?.imageUrl ?? m.depiction?.imageUrl,
      websiteUrl: detail.officialWebsiteUrl,
      phone: detail.addressInformation?.phoneNumber,
      officeAddress: detail.addressInformation?.officeAddress,
    };
  });

  // Sort: senators first, then house
  reps.sort((a, b) => {
    if (a.chamber === "Senate" && b.chamber !== "Senate") return -1;
    if (b.chamber === "Senate" && a.chamber !== "Senate") return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ reps, stateName, stateCode });
}
