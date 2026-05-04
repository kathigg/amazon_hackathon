import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRepsByStateName } from "@/lib/getRepsByState";
import { getRepsByZip } from "@/lib/getRepsByZip";
import { stateCodeToName } from "@/lib/us-states";

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
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item: Array<{ chamber: string }> };
}

interface MemberDetail {
  officialWebsiteUrl?: string;
  addressInformation?: { phoneNumber?: string; officeAddress?: string };
  depiction?: { imageUrl?: string };
  directOrderName?: string;
  partyHistory?: Array<{ partyName?: string }>;
}

async function zipToState(zip: string): Promise<{ stateCode: string; stateName: string } | null> {
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
  };
}

async function zipToCongressionalDistrict(zip: string): Promise<string | undefined> {
  const location = await fetch(`https://api.zippopotam.us/us/${zip}`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  const place = location?.places?.[0];

  if (!place?.latitude || !place?.longitude) {
    return undefined;
  }

  const response = await fetch(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${place.longitude}&y=${place.latitude}&benchmark=4&vintage=4&layers=54&format=json`
  );

  if (!response.ok) {
    return undefined;
  }

  const data = await response.json();
  const district =
    data?.result?.geographies?.["119th Congressional Districts"]?.[0]?.CD119;

  return typeof district === "string" && district.trim()
    ? String(Number(district))
    : undefined;
}

function normalizeName(value: string) {
  return value
    .replace(
      /\b(senator|sen\.|representative|rep\.|the honorable|honorable|mr\.|mrs\.|ms\.|dr\.)\b/gi,
      ""
    )
    .replace(/[.,']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDistrict(value?: string | number | null) {
  if (value === null || value === undefined) {
    return undefined;
  }

  const digits = String(value).replace(/\D/g, "");
  if (!digits) {
    return undefined;
  }

  return String(Number(digits));
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
  const stateName = stateCodeToName(stateCode);
  const normalizedDistrict = normalizeDistrict(district);
  const candidates = await prisma.representative.findMany({
    where: {
      chamber,
      state: {
        in: [stateCode, stateName].filter(Boolean) as string[],
      },
      ...(normalizedDistrict
        ? {
            district: normalizedDistrict,
          }
        : {}),
    },
    select: {
      bioguideId: true,
      firstName: true,
      lastName: true,
      district: true,
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

    if (normalized.includes(normalizeName(candidate.lastName))) {
      score += 20;
    }

    if (normalized.includes(normalizeName(candidate.firstName).split(" ")[0])) {
      score += 10;
    }

    if (
      normalizedDistrict &&
      normalizeDistrict(candidate.district) === normalizedDistrict
    ) {
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

  return [
    address.line1,
    `${address.city ?? ""}, ${address.state ?? ""} ${address.zip ?? ""}`.trim(),
  ]
    .filter(Boolean)
    .join(" · ");
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
  const state = await zipToState(zip);

  const reps: RepResult[] = [];

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
    const stateCode = (stateMatch?.[1] ?? state?.stateCode ?? "").toUpperCase();
    const district = normalizeDistrict(districtMatch?.[1]);

    for (const officialIndex of office.officialIndices ?? []) {
      const official = officials[officialIndex];
      if (!official) {
        continue;
      }

      const matchedRep = await findRepresentativeMatch({
        name: official.name,
        stateCode,
        chamber,
        district,
      });

      reps.push({
        bioguideId:
          matchedRep?.bioguideId ?? `${stateCode}-${chamber}-${officialIndex}`,
        name: official.name,
        party: official.party || "Unknown",
        chamber: chamber === "senate" ? "Senate" : "House of Representatives",
        office:
          chamber === "senate"
            ? `${state?.stateName ?? stateCode} · Senate`
            : `${state?.stateName ?? stateCode} · House${
                district ? ` · District ${district}` : ""
              }`,
        photoUrl: official.photoUrl,
        websiteUrl: official.urls?.[0],
        phone: official.phones?.[0],
        officeAddress: formatAddress(official.address?.[0]),
      });
    }
  }

  return {
    reps: dedupeReps(reps),
    stateCode: state?.stateCode ?? null,
    stateName: state?.stateName ?? null,
  };
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

async function lookupWithCongress(zip: string) {
  const [location, district] = await Promise.all([
    zipToState(zip),
    zipToCongressionalDistrict(zip),
  ]);

  if (!location || !CONGRESS_API_KEY) {
    return null;
  }

  const response = await fetch(
    `${BASE}/member/${location.stateCode}?currentMember=true&limit=50&api_key=${CONGRESS_API_KEY}&format=json`
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

    return (
      isHouse &&
      Boolean(district) &&
      normalizeDistrict(member.district) === normalizeDistrict(district)
    );
  });

  const combined = [...senators, ...houseMembers];
  const details = await Promise.all(
    combined.map((member) => fetchMemberDetail(member.bioguideId))
  );

  const reps = combined.map((member, index) => {
    const detail = details[index];
    const isSenator = member.terms?.item?.some(
      (term) => term.chamber === "Senate"
    );
    const party =
      detail.partyHistory?.[0]?.partyName ?? member.partyName ?? "Unknown";

    return {
      bioguideId: member.bioguideId,
      name: detail.directOrderName ?? member.name,
      party,
      chamber: isSenator ? "Senate" : "House of Representatives",
      office: `${location.stateName} · ${isSenator ? "Senate" : "House"}${
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
      if (left.chamber === "Senate" && right.chamber !== "Senate") return -1;
      if (right.chamber === "Senate" && left.chamber !== "Senate") return 1;
      return left.name.localeCompare(right.name);
    }),
    stateCode: location.stateCode,
    stateName: location.stateName,
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

  const [zipDbReps, congressResult, googleResult, location] = await Promise.all([
    getRepsByZip(zip),
    lookupWithCongress(zip),
    lookupWithGoogleCivic(zip),
    zipToState(zip),
  ]);

  if (zipDbReps.length > 0) {
    return NextResponse.json({
      reps: zipDbReps,
      stateName: zipDbReps[0]?.state ?? location?.stateName ?? "",
      stateCode: location?.stateCode ?? "",
    });
  }

  const externalResult = congressResult ?? googleResult;
  if (externalResult?.reps.length) {
    return NextResponse.json(externalResult);
  }

  if (location?.stateName) {
    const stateReps = await getRepsByStateName(location.stateName);
    if (stateReps.length > 0) {
      return NextResponse.json({
        reps: stateReps,
        stateName: location.stateName,
        stateCode: location.stateCode,
      });
    }
  }

  return NextResponse.json(
    { error: "Could not find representatives for that ZIP code." },
    { status: 404 }
  );
}
