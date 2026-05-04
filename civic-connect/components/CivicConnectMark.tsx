import clsx from "clsx";

export default function CivicConnectMark({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "relative flex h-11 w-11 items-center justify-center border border-black/10 bg-white",
        className
      )}
      aria-hidden="true"
    >
      <div className="flex items-end gap-1">
        <span className="h-3 w-1.5 bg-navy/55" />
        <span className="h-5 w-1.5 bg-navy/75" />
        <span className="h-7 w-1.5 bg-navy" />
      </div>
      <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
    </div>
  );
}
