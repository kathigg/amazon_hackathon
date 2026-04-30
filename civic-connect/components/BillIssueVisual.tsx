"use client";

import Image from "next/image";
import clsx from "clsx";
import { useState } from "react";

interface BillIssueVisualProps {
  billId: string;
  title: string;
  imageThumbnailUrl?: string | null;
  imageUrl?: string | null;
  imageTitle?: string | null;
  imageCreator?: string | null;
  imageLicense?: string | null;
  imageLicenseVersion?: string | null;
  className?: string;
  preferFull?: boolean;
}

export default function BillIssueVisual({
  billId,
  title,
  imageThumbnailUrl,
  imageUrl,
  imageTitle,
  imageCreator,
  imageLicense,
  imageLicenseVersion,
  className,
  preferFull = false,
}: BillIssueVisualProps) {
  const [hasError, setHasError] = useState(false);
  const hasImage = !hasError && Boolean(imageThumbnailUrl || imageUrl);

  return (
    <div
      className={clsx(
        "relative isolate overflow-hidden rounded-[24px] border border-gray-200 bg-gradient-to-br from-slate-100 via-white to-slate-200",
        className
      )}
    >
      {hasImage ? (
        <>
          <Image
            fill
            alt={imageTitle || title}
            src={`/api/bill-image/${billId}?size=${preferFull ? "full" : "thumb"}`}
            className="object-cover"
            sizes={preferFull ? "(min-width: 768px) 270px, 100vw" : "180px"}
            onError={() => setHasError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
          <div className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white backdrop-blur">
            Openverse
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 text-white">
            <p className="line-clamp-2 text-xs font-semibold leading-tight">
              {imageTitle || title}
            </p>
            {(imageCreator || imageLicense) && (
              <p className="mt-1 text-[11px] text-white/80">
                {[imageCreator ? `by ${imageCreator}` : null, formatLicense(imageLicense, imageLicenseVersion)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="flex h-full items-end p-4">
          <div>
            <div className="mb-2 inline-flex rounded-full bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
              Openverse
            </div>
            <p className="text-sm font-semibold leading-tight text-slate-700">
              No matching Openverse image yet
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLicense(
  license: string | null | undefined,
  version: string | null | undefined
) {
  if (!license) {
    return null;
  }

  const upper = license.toUpperCase();
  return version ? `${upper} ${version}` : upper;
}
