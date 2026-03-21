export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-gray-400">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-civic-blue rounded-full animate-spin" />
        <p className="text-sm">Loading…</p>
      </div>
    </div>
  );
}
