import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  safelist: [
    // Navy colors
    "bg-navy", "text-navy", "border-navy", "bg-navy/5", "bg-navy/10", "bg-navy/95",
    "hover:bg-navy", "hover:text-navy", "hover:border-navy",
    // Civic colors
    "bg-civic-blue", "text-civic-blue", "border-civic-blue", "hover:bg-civic-blue", "hover:text-civic-blue",
    "bg-civic-red", "text-civic-red", "border-civic-red", "hover:bg-civic-red",
    "text-civic-gold",
    // Cream
    "bg-cream", "hover:bg-cream",
    // Card utilities
    "rounded-card", "shadow-card", "shadow-card-hover",
    // Component classes
    "card", "tag", "btn-primary", "btn-outline", "status-badge",
    // Dynamic tag colors used in IssueCard
    "bg-rose-100", "text-rose-700", "border-rose-200",
    "bg-emerald-100", "text-emerald-700", "border-emerald-200",
    "bg-green-100", "text-green-700", "text-green-800", "border-green-200",
    "bg-sky-100", "text-sky-700", "border-sky-200",
    "bg-orange-100", "text-orange-700", "border-orange-200",
    "bg-slate-100", "text-slate-700", "text-slate-600", "border-slate-200",
    "bg-yellow-100", "text-yellow-700", "border-yellow-200",
    "bg-purple-100", "text-purple-700", "border-purple-200",
    "bg-cyan-100", "text-cyan-700", "border-cyan-200",
    "bg-pink-100", "text-pink-700", "border-pink-200",
    "bg-lime-100", "text-lime-700", "border-lime-200",
    "bg-blue-100", "text-blue-700", "text-blue-800", "border-blue-200",
    "bg-amber-100", "text-amber-700", "text-amber-800", "border-amber-200",
    "bg-indigo-100", "text-indigo-800",
    // Status badge colors
    "border-green-300", "border-blue-300", "border-violet-100", "border-violet-300",
    "bg-violet-100", "text-violet-800",
    "border-orange-300", "border-yellow-300", "border-sky-300", "border-gray-300", "border-amber-300",
    "text-sky-700", "text-orange-800", "text-yellow-800",
    "bg-gray-100", "text-gray-600", "text-gray-700", "border-gray-200",
    "bg-green-100", "text-green-800",
    // Font families
    "font-display", "font-sans",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#0A1628",
          light: "#132040",
          muted: "#1E3A5F",
        },
        cream: "#F8F7F4",
        civic: {
          red: "#C0392B",
          blue: "#2E4A8F",
          gold: "#D4A017",
        },
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        display: ["Playfair Display", "serif"],
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 4px 24px rgba(10,22,40,0.08)",
        "card-hover": "0 8px 40px rgba(10,22,40,0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
