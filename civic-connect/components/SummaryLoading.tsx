"use client";
import Image from "next/image";

export default function SummaryLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 bg-gradient-to-br from-blue-50 to-amber-50 rounded-2xl">
      <Image
        src="/squirrel-loading.gif"
        alt="Loading animation"
        width={180}
        height={180}
        unoptimized
        className="mb-2"
      />
      <div className="text-center">
        <p className="font-semibold text-navy text-sm">Reading the bill…</p>
        <p className="text-gray-400 text-xs mt-1 max-w-xs">
          Our AI is translating this into plain English. Usually takes 10–15 seconds.
        </p>
        <div className="flex justify-center gap-1 mt-3">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 bg-civic-blue rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
