#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve("public/topic-images-real");
const MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

const TOPICS: Array<{ key: string; queries: string[] }> = [
  { key: "healthcare", queries: ["hospital", "medical clinic", "medicine"] },
  { key: "tax", queries: ["tax", "budget", "financial district"] },
  { key: "immigration", queries: ["passport", "immigration", "border crossing"] },
  { key: "education", queries: ["school building exterior", "university campus", "library books"] },
  { key: "energy", queries: ["wind turbine field", "solar farm", "power infrastructure"] },
  { key: "housing", queries: ["apartment buildings", "residential neighborhood", "housing complex"] },
  { key: "security", queries: ["courthouse exterior", "government building security", "capitol police"] },
  { key: "economy", queries: ["downtown skyline business district", "small business storefront", "trade port"] },
  { key: "technology", queries: ["computer", "server", "telecommunications"] },
  { key: "transportation", queries: ["train", "bridge", "bus"] },
  { key: "general", queries: ["capitol", "government building", "city hall"] },
];

type PhotoCandidate = { title: string; url: string };

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const manifest: Record<string, string[]> = await readExistingManifest();

  for (const topic of TOPICS) {
    const topicDir = path.join(OUTPUT_DIR, topic.key);
    await fs.mkdir(topicDir, { recursive: true });
    const picked = await collect(topic.queries, 8);
    const outputPaths = picked.map((photo) => photo.url);
    if (outputPaths.length > 0) {
      manifest[topic.key] = outputPaths;
    } else if (!manifest[topic.key]) {
      manifest[topic.key] = [];
    }
    await fs.writeFile(
      path.join(topicDir, `${topic.key}.meta.json`),
      JSON.stringify(picked, null, 2),
      "utf8"
    );
    console.log(`topic=${topic.key} selected=${outputPaths.length}`);
  }

  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`wrote ${MANIFEST_PATH}`);
}

async function readExistingManifest() {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as Record<string, string[]>;
    return parsed;
  } catch {
    return {};
  }
}

async function collect(queries: string[], minCount: number) {
  const selected: PhotoCandidate[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const results = await searchCommons(query);
    for (const image of results) {
      const key = image.url;
      if (!key || seen.has(key) || !isAllowedPhoto(image.title)) continue;
      seen.add(key);
      selected.push(image);
      if (selected.length >= minCount) return selected;
    }
  }
  return selected;
}

async function searchCommons(query: string): Promise<PhotoCandidate[]> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "20");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url");
  url.searchParams.set("iiurlwidth", "1280");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  const response = await fetch(url, {
    headers: { "User-Agent": "CivicConnect/0.1 (topic photo catalog)" },
  });
  if (!response.ok) return [];
  const data = (await response.json()) as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: Array<{ thumburl?: string; url?: string }> }> };
  };
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .map((page) => ({
      title: page.title ?? "",
      url: page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url ?? "",
    }))
    .filter((row) => Boolean(row.url));
}

function isAllowedPhoto(title: string) {
  const text = `${title}`.toLowerCase();
  if (/\b(ai|generated|midjourney|stable diffusion|dall[- ]?e|illustration|vector|clipart|cartoon|drawing|painting|render|cgi|3d|icon|logo)\b/.test(text)) {
    return false;
  }
  if (!/\.(jpg|jpeg|png|webp)$/i.test(text)) return true;
  return true;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
