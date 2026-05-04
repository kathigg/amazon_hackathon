import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY;
const GOOGLE_CIVIC_API_KEY = process.env.GOOGLE_CIVIC_API_KEY;
const BASE = "https://api.congress.gov/v3";

interface RepResult {
  bioguideId: string;
  name: string;
  party: string;
  chamber: string;
  office: string;
  photoUrl?: string;
  websiteUrl?: string;
  phone?: string;
  officeAddress?: string;
}

interface CongressMember {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item: Array<{ chamber: string; startYear: number }> };
}

interface MemberDetail {
  officialWebsiteUrl?: string;
  addressInformation?: { phoneNumber?: string; officeAddress?: string };
  depiction?: { imageUrl?: string };
  directOrderName?: string;
  partyHistory?: Array<{ partyName: string }>;
}

interface ZipLocation {
  stateCode: string;
  stateName: string;
  latitude?: string;
  longitude?: string;
}

async function zipToLocation(zip: string): Promise<ZipLocation | null> {
  const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const place = data.places?.[0];

  if (!place) {
    return null;
  }

  return {
    stateCode: place["state abbreviation"],
    stateName: place["state"],
    latitude: place.latitude,
    longitude: place.longitude,
  };
}

async function zipToCongressionalDistrict(zip: string): Promise<string | undefined> {
  const location = await zipToLocation(zip);
  if (!location?.latitude || !location.longitude) {
    return undefined;
  }

  const response = await fetch(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${location.longitude}&y=${location.latitude}&benchmark=4&vintage=4&layers=54&format=json`
  );

  if (!response.ok) {
    return undefined;
  }

  const data = await response.json();
  const district =
    data?.result?.geographies?.["119th Congressional Districts"]?.[0]?.CD119;

  return typeof district === "string" && district.trim() ? district.trim() : undefined;
}

async function fetchMemberDetail(bioguideId: string): Promise<MemberDetail> {
  if (!CONGRESS_API_KEY) {
    return {};
  }

  const response = await fetch(
    `${BASE}/member/${bioguideId}?api_key=${CONGRESS_API_KEY}&format=json`
  );

  if (!response.ok) {
    return {};
  }

  const data = await response.json();
  return data.member ?? {};
}

function normalizeName(value: string) {
  return value
    .replace(/\b(senator|sen\.|representative|rep\.|the honorable|honorable|mr\.|mrs\.|ms\.|dr\.)\b/gi, "")
    .replace(/[.,']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function findRepresentativeMatch({
  name,
  stateCode,
  chamber,
  district,
}: {
  name: string;
  stateCode: string;
  chamber: "house" | "senate";
  district?: string;
}) {
  const normalized = normalizeName(name);
  const candidates = await prisma.representative.findMany({
    where: {
      state: stateCode,
      chamber,
      ...(district
        ? {
            district,
          }
        : {}),
    },
    select: {
      bioguideId: true,
      firstName: true,
      lastName: true,
      party: true,
      chamber: true,
      state: true,
      district: true,
      websiteUrl: true,
    },
  });

  let bestMatch: (typeof candidates)[number] | null = null;
  let bestScore = -1;

  for (const candidate of candidates) {
    const candidateName = normalizeName(
      `${candidate.firstName} ${candidate.lastName}`
    );
    let score = 0;

    if (candidateName === normalized) {
      score += 100;
    }

    const lastName = normalizeName(candidate.lastName);
    if (normalized.includes(lastName)) {
      score += 20;
    }

    const firstName = normalizeName(candidate.firstName).split(" ")[0];
    if (normalized.includes(firstName)) {
      score += 10;
    }

    if (district && candidate.district === district) {
      score += 15;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidate;
    }
  }

  return bestScore >= 20 ? bestMatch : null;
}

function formatAddress(address?: {
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
}) {
  if (!address) {
    return undefined;
  }

  return [address.line1, `${address.city ?? ""}, ${address.state ?? ""} ${address.zip ?? ""}`.trim()]
    .filter(Boolean)
    .join(" · ");
}

async function lookupWithGoogleCivic(zip: string) {
  if (!GOOGLE_CIVIC_API_KEY) {
    return null;
  }

  const response = await fetch(
    `https://www.googleapis.com/civicinfo/v2/representatives?address=${zip}&levels=country&roles=legislatorUpperBody&roles=legislatorLowerBody&key=${GOOGLE_CIVIC_API_KEY}`
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const officials = data.officials ?? [];
  const offices = data.offices ?? [];

  const reps: RepResult[] = [];
  let stateCode = "";
  let stateName = "";

  for (const office of offices) {
    const roles: string[] = office.roles ?? [];
    const isSenate = roles.includes("legislatorUpperBody");
    const isHouse = roles.includes("legislatorLowerBody");

    if (!isSenate && !isHouse) {
      continue;
    }

    const chamber = isSenate ? "senate" : "house";
    const divisionId: string = office.divisionId ?? "";
    const stateMatch = divisionId.match(/state:([a-z]{2})/i);
    const districtMatch = divisionId.match(/cd:(\d+)/i);

    if (stateMatch) {
      stateCode = stateMatch[1].toUpperCase();
    }

    for (const officialIndex of office.officialIndices ?? []) {
      const official = officials[officialIndex];
      if (!official) {
        continue;
      }

      const matchedRep = await findRepresentativeMatch({
        name: official.name,
        stateCode,
        chamber,
        district: districtMatch?.[1],
      });

      const partyName = official.party || "Unknown";
      const officeLabel =
        chamber === "senate"
          ? `${stateCode} · Senate`
          : `${stateCode} · House${districtMatch ? ` · District ${districtMatch[1]}` : ""}`;

      reps.push({
        bioguideId: matchedRep?.bioguideId ?? `${stateCode}-${chamber}-${officialIndex}`,
        name: official.name,
        party: partyName,
        chamber: chamber === "senate" ? "Senate" : "House of Representatives",
        office: officeLabel,
        photoUrl: official.photoUrl,
        websiteUrl: official.urls?.[0],
        phone: official.phones?.[0],
        officeAddress: formatAddress(official.address?.[0]),
      });

      if (!stateName && office.name?.includes("Senate")) {
        stateName = office.name.replace("United States Senate", "").trim();
      }
    }
  }

  const location = await zipToLocation(zip);

  return {
    reps: dedupeReps(reps),
    stateCode: location?.stateCode ?? stateCode,
    stateName: location?.stateName ?? stateName,
  };
}

function dedupeReps(reps: RepResult[]) {
  const seen = new Set<string>();
  return reps.filter((rep) => {
    if (seen.has(rep.bioguideId)) {
      return false;
    }

    seen.add(rep.bioguideId);
    return true;
  });
}

async function lookupWithCongress(zip: string) {
  const [location, district] = await Promise.all([
    zipToLocation(zip),
    zipToCongressionalDistrict(zip),
  ]);
  if (!location || !CONGRESS_API_KEY) {
    return null;
  }

  const { stateCode, stateName } = location;
  const response = await fetch(
    `${BASE}/member/${stateCode}?currentMember=true&limit=50&api_key=${CONGRESS_API_KEY}&format=json`
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const members: CongressMember[] = data.members ?? [];
  const senators = members.filter((member) =>
    member.terms?.item?.some((term) => term.chamber === "Senate")
  );
  const houseMembers = members.filter((member) => {
    const isHouse = member.terms?.item?.some(
      (term) => term.chamber === "House of Representatives"
    );

    if (!isHouse) {
      return false;
    }

    if (!district) {
      return false;
    }

    return String(member.district ?? "") === String(Number(district));
  });
  const combined = [...senators, ...houseMembers];
  const details = await Promise.all(
    combined.map((member) => fetchMemberDetail(member.bioguideId))
  );

  const reps = combined.map((member, index) => {
    const detail = details[index];
    const isSenator = member.terms?.item?.some((term) => term.chamber === "Senate");
    const party =
      detail.partyHistory?.[0]?.partyName ?? member.partyName ?? "Unknown";

    return {
      bioguideId: member.bioguideId,
      name: detail.directOrderName ?? member.name,
      party,
      chamber: isSenator ? "Senate" : "House of Representatives",
      office: `${stateName} · ${isSenator ? "Senate" : "House"}${
        member.district ? ` · District ${member.district}` : ""
      }`,
      photoUrl: detail.depiction?.imageUrl ?? member.depiction?.imageUrl,
      websiteUrl: detail.officialWebsiteUrl,
      phone: detail.addressInformation?.phoneNumber,
      officeAddress: detail.addressInformation?.officeAddress,
    } satisfies RepResult;
  });

  return {
    reps: dedupeReps(reps).sort((left, right) => {
      if (left.chamber === "Senate" && right.chamber !== "Senate") {
        return -1;
      }

      if (right.chamber === "Senate" && left.chamber !== "Senate") {
        return 1;
      }

      return left.name.localeCompare(right.name);
    }),
    stateCode,
    stateName,
  };
}

export async function GET(req: NextRequest) {
  const zip = req.nextUrl.searchParams.get("zip");
  if (!zip || !/^\d{5}$/.test(zip)) {
    return NextResponse.json(
      { error: "Valid 5-digit ZIP required" },
      { status: 400 }
    );
  }

  const result = (await lookupWithGoogleCivic(zip)) ?? (await lookupWithCongress(zip));

  if (!result) {
    return NextResponse.json(
      { error: "Could not find representatives for that ZIP code." },
      { status: 404 }
    );
  }

  return NextResponse.json(result);
}
