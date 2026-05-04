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
  showAttribution?: boolean; // New prop to control attribution display
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
  showAttribution = false, // Default to hidden
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
          
          {showAttribution && (
            <>
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
          )}
        </>
      ) : (
        <div className="relative h-full overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(22,59,112,0.16),transparent_34%),linear-gradient(135deg,rgba(16,36,62,0.04),rgba(22,59,112,0.14))]" />
          <div className="absolute left-4 top-4 inline-flex rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-700">
            Policy Graphic
          </div>
          <div className="absolute bottom-4 left-4 right-4">
            <div className="mb-3 flex items-end gap-2">
              <span className="h-8 w-2 rounded-full bg-navy/25" />
              <span className="h-12 w-2 rounded-full bg-navy/45" />
              <span className="h-16 w-2 rounded-full bg-navy/70" />
              <span className="h-10 w-2 rounded-full bg-civic-blue/50" />
            </div>
            <p className="text-sm font-semibold leading-tight text-slate-700">
              Editorial placeholder graphic
            </p>
            <p className="mt-1 text-xs text-slate-500">
              We use general issue imagery rather than portraits when no bill art
              is available.
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
