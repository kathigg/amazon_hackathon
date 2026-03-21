"use client";
import { Player } from "@lottiefiles/react-lottie-player";

export default function SummaryLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 bg-gradient-to-br from-blue-50 to-amber-50 rounded-2xl">
      <Player
        autoplay
        loop
        // Cute "document reading" animation from LottieFiles public CDN
        src="https://assets9.lottiefiles.com/packages/lf20_kxsd2ytq.json"
        style={{ height: 180, width: 180 }}
      />
      <div className="text-center -mt-2">
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
