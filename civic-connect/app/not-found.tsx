import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <p className="text-6xl mb-4">🏛️</p>
      <h1 className="font-display text-4xl font-bold text-navy mb-3">Page Not Found</h1>
      <p className="text-gray-500 mb-8">This page doesn't exist or the bill may have been removed.</p>
      <Link href="/bills" className="btn-primary">Browse Active Bills</Link>
    </div>
  );
}
