import { headers } from "next/headers";
import { stateCodeToName } from "./us-states";

export interface ViewerLocation {
  country: string | null;
  stateCode: string | null;
  stateName: string | null;
  postalCode: string | null;
  source: "cloudfront" | "dev-mock" | "none";
}

function normalizePostalCode(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const five = trimmed.split("-")[0];
  return /^\d{5}$/.test(five) ? five : null;
}

export function getViewerLocation(
  devStateOverride?: string | null,
  devPostalOverride?: string | null,
): ViewerLocation {
  const h = headers();
  const country = h.get("cloudfront-viewer-country");
  const region = h.get("cloudfront-viewer-country-region");
  const postalCode = normalizePostalCode(h.get("cloudfront-viewer-postal-code"));

  const isUS = country === "US";
  const stateCode = isUS && region && region.length > 0 ? region.toUpperCase() : null;

  if (stateCode) {
    return {
      country,
      stateCode,
      stateName: stateCodeToName(stateCode),
      postalCode,
      source: "cloudfront",
    };
  }

  // Dev fallback: when CloudFront isn't in front of us (local dev),
  // mock a viewer location so the ActionCard rep section is visible.
  // Disable by setting DISABLE_DEV_VIEWER_LOCATION=1.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DISABLE_DEV_VIEWER_LOCATION !== "1"
  ) {
    const stateOverridden = !!(devStateOverride ?? process.env.DEV_VIEWER_STATE);
    const mockCode = (devStateOverride ?? process.env.DEV_VIEWER_STATE ?? "DE").toUpperCase();
    const mockName = stateCodeToName(mockCode);
    // Default ZIP only applies when state is also at its default (DE).
    // If the developer overrides the state, don't shove a DE ZIP into a non-DE mock.
    const defaultPostal = stateOverridden ? null : "19713";
    const mockPostal = normalizePostalCode(
      devPostalOverride ?? process.env.DEV_VIEWER_POSTAL ?? defaultPostal,
    );
    if (mockName) {
      return {
        country: "US",
        stateCode: mockCode,
        stateName: mockName,
        postalCode: mockPostal,
        source: "dev-mock",
      };
    }
  }

  return {
    country: country && country.length > 0 ? country : null,
    stateCode: null,
    stateName: null,
    postalCode,
    source: "none",
  };
}
