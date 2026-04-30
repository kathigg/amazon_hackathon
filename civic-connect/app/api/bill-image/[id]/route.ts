import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const size = req.nextUrl.searchParams.get("size") === "full" ? "full" : "thumb";

  const bill = await prisma.bill.findUnique({
    where: { id: params.id },
    select: {
      imageUrl: true,
      imageThumbnailUrl: true,
    },
  });

  const targetUrl =
    size === "full"
      ? bill?.imageUrl ?? bill?.imageThumbnailUrl
      : bill?.imageThumbnailUrl ?? bill?.imageUrl;

  if (!targetUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
  } catch {
    return new NextResponse("Invalid image URL", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return new NextResponse("Unsupported protocol", { status: 400 });
  }

  const imageResponse = await fetch(parsedUrl, {
    headers: {
      "User-Agent": "CivicConnect/0.1 (Openverse image proxy)",
    },
  });

  if (!imageResponse.ok || !imageResponse.body) {
    return new NextResponse("Upstream image unavailable", { status: 502 });
  }

  const headers = new Headers();
  headers.set("Content-Type", imageResponse.headers.get("content-type") ?? "image/jpeg");
  headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");

  return new NextResponse(imageResponse.body, {
    status: 200,
    headers,
  });
}
