import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const globalForS3 = globalThis as unknown as { __civicS3?: S3Client };

function getS3Client(): S3Client {
  if (!globalForS3.__civicS3) {
    globalForS3.__civicS3 = new S3Client({
      region: process.env.AWS_REGION ?? "us-east-1",
    });
  }
  return globalForS3.__civicS3;
}

export function getImageBucket(): string {
  const bucket = process.env.IMAGE_S3_BUCKET;
  if (!bucket) {
    throw new Error("IMAGE_S3_BUCKET is not set");
  }
  return bucket;
}

export function getImageCdnHost(): string {
  const host = process.env.IMAGE_CDN_HOST;
  if (!host) {
    throw new Error("IMAGE_CDN_HOST is not set");
  }
  return host.replace(/\/+$/, "");
}

export function buildCdnUrl(storageKey: string): string {
  return `${getImageCdnHost()}/${storageKey.replace(/^\/+/, "")}`;
}

export async function objectExists(storageKey: string): Promise<boolean> {
  try {
    await getS3Client().send(
      new HeadObjectCommand({
        Bucket: getImageBucket(),
        Key: storageKey,
      })
    );
    return true;
  } catch (error) {
    const code = (error as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (code === 404 || code === 403) {
      return false;
    }
    throw error;
  }
}

export async function putImage(
  storageKey: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: getImageBucket(),
      Key: storageKey,
      Body: bytes,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function getImage(storageKey: string): Promise<Buffer> {
  const response = await getS3Client().send(
    new GetObjectCommand({
      Bucket: getImageBucket(),
      Key: storageKey,
    })
  );
  if (!response.Body) {
    throw new Error(`S3 GetObject returned no body for ${storageKey}`);
  }
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
