/**
 * Storage abstraction for the curation script. Picks a backend based on env:
 *
 *   IMAGE_LOCAL_DIR=public/curated-images   → filesystem mode (no AWS).
 *                                             cdnUrl is a relative path served
 *                                             by Next.js static; works in dev
 *                                             and for `next start` in prod.
 *   IMAGE_S3_BUCKET=civic-connect-images    → S3 mode (requires
 *   IMAGE_CDN_HOST=https://...                @aws-sdk/client-s3 installed).
 *
 * Audit mode never touches storage; only commit mode calls getStorage().
 */

import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";

export interface Storage {
  putImage(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  getImage(key: string): Promise<Buffer>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  buildPublicUrl(key: string): string;
  describe(): string;
}

let cached: Storage | null = null;

export async function getStorage(): Promise<Storage> {
  if (cached) return cached;

  const localDir = process.env.IMAGE_LOCAL_DIR;
  const s3Bucket = process.env.IMAGE_S3_BUCKET;

  if (localDir) {
    cached = await createLocalStorage(localDir);
    return cached;
  }
  if (s3Bucket) {
    cached = await createS3Storage();
    return cached;
  }

  throw new Error(
    "No storage backend configured. Set IMAGE_LOCAL_DIR=public/curated-images for filesystem mode, or IMAGE_S3_BUCKET + IMAGE_CDN_HOST for S3 mode."
  );
}

async function createLocalStorage(localDir: string): Promise<Storage> {
  const absDir = path.resolve(process.cwd(), localDir);
  await fs.mkdir(absDir, { recursive: true });

  // Determine the public URL prefix. If the dir is under `public/`, the URL
  // is rooted at "/<rest>". Otherwise we require IMAGE_LOCAL_URL_PREFIX.
  const publicDir = path.resolve(process.cwd(), "public");
  let urlPrefix: string;
  if (absDir === publicDir || absDir.startsWith(`${publicDir}${path.sep}`)) {
    urlPrefix = `/${path.relative(publicDir, absDir).split(path.sep).join("/")}`;
  } else if (process.env.IMAGE_LOCAL_URL_PREFIX) {
    urlPrefix = process.env.IMAGE_LOCAL_URL_PREFIX.replace(/\/+$/, "");
  } else {
    throw new Error(
      `IMAGE_LOCAL_DIR (${absDir}) is outside ./public; set IMAGE_LOCAL_URL_PREFIX too.`
    );
  }

  // keys arrive URL-encoded (so they're safe in cdnUrl); on disk we need the
  // decoded form so Next.js's static handler — which percent-decodes the URL
  // before file lookup — can find them.
  const toDiskPath = (key: string) =>
    path.join(absDir, ...key.split("/").map(decodeURIComponent));

  return {
    async putImage(key, bytes) {
      const target = toDiskPath(key);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, bytes);
    },
    async getImage(key) {
      return fs.readFile(toDiskPath(key));
    },
    async objectExists(key) {
      return existsSync(toDiskPath(key));
    },
    async deleteObject(key) {
      await fs.unlink(toDiskPath(key)).catch(() => {});
    },
    buildPublicUrl(key) {
      return `${urlPrefix}/${key.replace(/^\/+/, "")}`;
    },
    describe() {
      return `local filesystem at ${absDir} (served at ${urlPrefix})`;
    },
  };
}

async function createS3Storage(): Promise<Storage> {
  const aws = await import("./aws-s3");
  return {
    putImage: aws.putImage,
    getImage: aws.getImage,
    objectExists: aws.objectExists,
    deleteObject: aws.deleteObject,
    buildPublicUrl: aws.buildCdnUrl,
    describe: () =>
      `S3 bucket s3://${aws.getImageBucket()} via CDN ${aws.getImageCdnHost()}`,
  };
}
