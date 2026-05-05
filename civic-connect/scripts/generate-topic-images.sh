#!/usr/bin/env bash
set -euo pipefail
BASE="/Users/kathleenhiggins/amazon_hackathon/civic-connect/public/topic-images"
make_svg() {
  local file="$1"; local p="$2"; local s="$3"; local l="$4"
  cat > "$file" <<EOF
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="$l policy image">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="720" fill="url(#bg)"/>
  <circle cx="980" cy="110" r="150" fill="$s" opacity="0.2"/>
  <rect x="70" y="80" width="300" height="56" rx="28" fill="white" opacity="0.92"/>
  <text x="106" y="116" fill="$p" font-size="28" font-family="Arial,sans-serif" font-weight="700">$l</text>
  <rect x="110" y="420" width="42" height="170" rx="21" fill="$p" opacity="0.35"/>
  <rect x="170" y="360" width="42" height="230" rx="21" fill="$s" opacity="0.55"/>
  <rect x="230" y="310" width="42" height="280" rx="21" fill="$p" opacity="0.75"/>
  <rect x="290" y="380" width="42" height="210" rx="21" fill="$s" opacity="0.65"/>
  <line x1="360" y1="590" x2="1030" y2="590" stroke="$p" stroke-opacity="0.2" stroke-width="4"/>
</svg>
EOF
}
make_set() {
  local topic="$1"; local label="$2"; local p1="$3"; local s1="$4"; local p2="$5"; local s2="$6"; local p3="$7"; local s3="$8"
  make_svg "$BASE/$topic/$topic-1.svg" "$p1" "$s1" "$label"
  make_svg "$BASE/$topic/$topic-2.svg" "$p2" "$s2" "$label"
  make_svg "$BASE/$topic/$topic-3.svg" "$p3" "$s3" "$label"
}
make_set healthcare "Healthcare" "#0f766e" "#14b8a6" "#0d9488" "#2dd4bf" "#115e59" "#5eead4"
make_set tax "Tax" "#7c2d12" "#ea580c" "#9a3412" "#fb923c" "#b45309" "#fdba74"
make_set immigration "Immigration" "#1d4ed8" "#3b82f6" "#1e40af" "#60a5fa" "#1e3a8a" "#93c5fd"
make_set education "Education" "#4338ca" "#6366f1" "#3730a3" "#818cf8" "#312e81" "#a5b4fc"
make_set energy "Energy" "#166534" "#22c55e" "#15803d" "#4ade80" "#14532d" "#86efac"
make_set housing "Housing" "#0f766e" "#06b6d4" "#155e75" "#22d3ee" "#164e63" "#67e8f9"
make_set security "Security" "#111827" "#4b5563" "#1f2937" "#6b7280" "#374151" "#9ca3af"
make_set economy "Economy" "#7c3aed" "#8b5cf6" "#6d28d9" "#a78bfa" "#5b21b6" "#c4b5fd"
make_set technology "Technology" "#0c4a6e" "#0284c7" "#075985" "#38bdf8" "#082f49" "#7dd3fc"
make_set transportation "Transportation" "#334155" "#64748b" "#1e293b" "#94a3b8" "#475569" "#cbd5e1"
make_set general "General" "#1f2937" "#64748b" "#334155" "#94a3b8" "#475569" "#cbd5e1"
