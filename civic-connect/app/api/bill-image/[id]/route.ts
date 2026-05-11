import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBillImageRecord } from "@/lib/bill-image-categories";
import { fetchAssetUrlsForBills } from "@/lib/image-pool-read";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const bill = await prisma.bill.findUnique({
    where: { id: params.id },
    select: { id: true, topicTags: true, imageUrl: true },
  });

  if (bill) {
    const assetUrlByBillId = await fetchAssetUrlsForBills([bill.id]);
    const assetUrl = assetUrlByBillId.get(bill.id);
    if (assetUrl) {
      return NextResponse.redirect(assetUrl, {
        status: 307,
        headers: {
          "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        },
      });
    }
  }

  const storedImageUrl = bill?.imageUrl ?? null;
  if (isTrustedStoredImage(storedImageUrl)) {
    return NextResponse.redirect(storedImageUrl, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  if (bill) {
    const categoryImage = getBillImageRecord(bill.id, bill.topicTags).imageUrl;
    return NextResponse.redirect(categoryImage, {
      status: 307,
      headers: {
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  }

  const svg = renderPlaceholderSvg(params.id);

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}

function isTrustedStoredImage(imageUrl?: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  if (imageUrl.startsWith("/topic-images/")) {
    return true;
  }

  const configuredHost = process.env.IMAGE_CDN_HOST?.replace(/\/+$/, "");
  if (configuredHost) {
    return imageUrl.startsWith(`${configuredHost}/`);
  }

  return imageUrl.includes("amazonaws.com/") || imageUrl.includes("cloudfront.net/");
}

function renderPlaceholderSvg(id: string) {
  const accents = [
    ["#10243e", "#3b82f6"],
    ["#6b4614", "#d7a04b"],
    ["#14532d", "#14b8a6"],
    ["#0c4a6e", "#6366f1"],
  ] as const;
  const [primary, secondary] = accents[hashString(id) % accents.length];
  const label = escapeXml(id.toUpperCase());

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480" role="img" aria-label="Policy graphic for ${label}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="55%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="720" height="480" fill="url(#bg)"/>
  <circle cx="590" cy="92" r="100" fill="${secondary}" opacity="0.14"/>
  <rect x="54" y="66" width="154" height="34" rx="17" fill="#ffffff" opacity="0.92"/>
  <text x="84" y="88" fill="${primary}" font-size="18" font-family="Arial, sans-serif" font-weight="700" letter-spacing="2">POLICY GRAPHIC</text>
  <text x="554" y="88" fill="${primary}" font-size="18" font-family="Arial, sans-serif" font-weight="700" text-anchor="end">${label}</text>
  <rect x="88" y="326" width="24" height="74" rx="12" fill="${primary}" opacity="0.36"/>
  <rect x="126" y="284" width="24" height="116" rx="12" fill="${secondary}" opacity="0.52"/>
  <rect x="164" y="236" width="24" height="164" rx="12" fill="${primary}" opacity="0.76"/>
  <rect x="202" y="270" width="24" height="130" rx="12" fill="${secondary}" opacity="0.68"/>
  <line x1="246" y1="399" x2="628" y2="399" stroke="${primary}" stroke-opacity="0.14" stroke-width="3"/>
  <text x="88" y="428" fill="#334155" font-size="28" font-family="Arial, sans-serif" font-weight="700">Policy graphic fallback</text>
  <text x="88" y="456" fill="#64748b" font-size="18" font-family="Arial, sans-serif">CivicConnect uses general policy visuals rather than remote bill photography.</text>
</svg>`;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33 + value.charCodeAt(index)) >>> 0;
  }

  return hash;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
