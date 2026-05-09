import { getStageLabel, type ProgressStage } from "@/lib/bill-progress";

const STAGE_STYLE: Record<ProgressStage, string> = {
  introduced: "bg-gray-100 text-gray-700 border-gray-300",
  committee: "bg-amber-50 text-amber-800 border-amber-300",
  passed_origin: "bg-blue-50 text-blue-800 border-blue-300",
  passed_both: "bg-indigo-50 text-indigo-800 border-indigo-300",
  to_president: "bg-purple-50 text-purple-800 border-purple-300",
  enacted: "bg-emerald-50 text-emerald-800 border-emerald-300",
};

interface Props {
  stage: ProgressStage | null | undefined;
  billType?: string;
  className?: string;
}

export default function MilestonePill({ stage, billType, className = "" }: Props) {
  if (!stage) return null;
  const label = getStageLabel(stage, billType);
  const style = STAGE_STYLE[stage] ?? STAGE_STYLE.introduced;
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${style} ${className}`}
    >
      {label}
    </span>
  );
}
