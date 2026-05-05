import clsx from "clsx";

interface BillIssueVisualProps {
  billId: string;
  title: string;
  topicLabel?: string | null;
  topicTags: string[];
  imageUrl?: string | null;
  className?: string;
  preferFull?: boolean;
}

export default function BillIssueVisual({
  billId,
  title,
  topicLabel,
  topicTags: _topicTags,
  imageUrl: _imageUrl,
  className,
  preferFull = false,
}: BillIssueVisualProps) {
  // Prefer a deterministic editorial placeholder over noisy/irrelevant stock
  // imagery. (We still accept `imageUrl` for future use, but do not default to it.)
  const imagePath = `/api/bill-image/${billId}`;
  const label = topicLabel?.trim() || "Policy graphic";
  const capsule = preferFull ? "px-3 py-1.5 text-[10px]" : "px-2.5 py-1 text-[9px]";

  return (
    <div
      aria-label={`${label} graphic for ${title}`}
      className={clsx(
        "relative isolate overflow-hidden rounded-[24px] border border-gray-200 bg-white",
        className
      )}
    >
      <img
        src={imagePath}
        alt={`${label} graphic`}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover"
      />

      <div
        className={clsx(
          "absolute left-4 top-4 inline-flex rounded-full bg-white/90 font-semibold uppercase tracking-[0.18em] text-navy/75 shadow-sm backdrop-blur",
          capsule
        )}
      >
        {label}
      </div>

      <div className="absolute right-4 top-4 text-right">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-navy/45">
          {billId.toUpperCase()}
        </p>
      </div>
    </div>
  );
}
