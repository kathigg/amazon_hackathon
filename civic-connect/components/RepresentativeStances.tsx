import { prisma } from "@/lib/prisma";

interface RepresentativeStancesProps {
  billId: string;
  chamber?: "house" | "senate" | "both";
}

export default async function RepresentativeStances({
  billId,
  chamber = "both",
}: RepresentativeStancesProps) {
  // Get all stances for this bill
  const stances = await prisma.repStance.findMany({
    where: {
      billId,
      ...(chamber !== "both" && {
        representative: { chamber },
      }),
    },
    include: {
      representative: true,
    },
    orderBy: {
      confidence: "desc",
    },
  });

  if (stances.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="text-gray-500 text-sm">
          No representative stances found yet. Check back after the next scraping cycle.
        </p>
      </div>
    );
  }

  // Count by stance
  const counts = {
    strong_support: stances.filter((s) => s.stance === "strong_support").length,
    possible_support: stances.filter((s) => s.stance === "possible_support").length,
    neutral: stances.filter((s) => s.stance === "neutral").length,
    possible_reject: stances.filter((s) => s.stance === "possible_reject").length,
    strong_reject: stances.filter((s) => s.stance === "strong_reject").length,
  };

  const total = stances.length;
  const supportCount = counts.strong_support + counts.possible_support;
  const rejectCount = counts.strong_reject + counts.possible_reject;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card p-6">
        <h3 className="font-bold text-navy text-xl mb-4">
          Representative Positions
        </h3>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{supportCount}</div>
            <div className="text-sm text-gray-500">Support</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-400">{counts.neutral}</div>
            <div className="text-sm text-gray-500">Neutral</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{rejectCount}</div>
            <div className="text-sm text-gray-500">Oppose</div>
          </div>
        </div>

        {/* Visual bar */}
        <div className="h-8 rounded-full overflow-hidden flex bg-gray-100">
          {supportCount > 0 && (
            <div
              className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
              style={{ width: `${(supportCount / total) * 100}%` }}
            >
              {Math.round((supportCount / total) * 100)}%
            </div>
          )}
          {counts.neutral > 0 && (
            <div
              className="bg-gray-300 flex items-center justify-center text-gray-700 text-xs font-bold"
              style={{ width: `${(counts.neutral / total) * 100}%` }}
            >
              {Math.round((counts.neutral / total) * 100)}%
            </div>
          )}
          {rejectCount > 0 && (
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-bold"
              style={{ width: `${(rejectCount / total) * 100}%` }}
            >
              {Math.round((rejectCount / total) * 100)}%
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 mt-3">
          Based on analysis of {total} representative{total !== 1 ? "s'" : "'s"} public
          statements and voting records
        </p>
      </div>

      {/* Detailed breakdown */}
      <div className="card p-6">
        <h4 className="font-semibold text-navy mb-4">Stance Breakdown</h4>
        
        <div className="space-y-3">
          {[
            { key: "strong_support", label: "Strong Support", color: "bg-green-600", count: counts.strong_support },
            { key: "possible_support", label: "Possible Support", color: "bg-green-400", count: counts.possible_support },
            { key: "neutral", label: "No Position", color: "bg-gray-300", count: counts.neutral },
            { key: "possible_reject", label: "Possible Opposition", color: "bg-red-400", count: counts.possible_reject },
            { key: "strong_reject", label: "Strong Opposition", color: "bg-red-600", count: counts.strong_reject },
          ].map((item) => (
            <div key={item.key} className="flex items-center gap-3">
              <div className={`w-4 h-4 rounded ${item.color}`} />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">{item.label}</span>
                  <span className="text-sm font-bold text-navy">{item.count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top representatives */}
      <div className="card p-6">
        <h4 className="font-semibold text-navy mb-4">Notable Positions</h4>
        
        <div className="space-y-3">
          {stances
            .filter((s) => s.stance !== "neutral" && s.confidence > 0.5)
            .slice(0, 10)
            .map((stance) => (
              <div
                key={stance.id}
                className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-navy text-sm">
                      {stance.representative.firstName} {stance.representative.lastName}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({stance.representative.party}-{stance.representative.state})
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2">
                    <StanceBadge stance={stance.stance} />
                    <span className="text-xs text-gray-400">
                      {Math.round(stance.confidence * 100)}% confidence
                    </span>
                  </div>

                  {stance.reasoning && (
                    <p className="text-xs text-gray-600 leading-relaxed">
                      {stance.reasoning}
                    </p>
                  )}
                </div>
              </div>
            ))}
        </div>

        {stances.filter((s) => s.stance !== "neutral" && s.confidence > 0.5).length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">
            No high-confidence positions found yet
          </p>
        )}
      </div>
    </div>
  );
}

function StanceBadge({ stance }: { stance: string }) {
  const config = {
    strong_support: { label: "Strong Support", color: "bg-green-100 text-green-700" },
    possible_support: { label: "Likely Supports", color: "bg-green-50 text-green-600" },
    neutral: { label: "No Position", color: "bg-gray-100 text-gray-600" },
    possible_reject: { label: "Likely Opposes", color: "bg-red-50 text-red-600" },
    strong_reject: { label: "Strong Opposition", color: "bg-red-100 text-red-700" },
  };

  const { label, color } = config[stance as keyof typeof config] || config.neutral;

  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${color}`}>
      {label}
    </span>
  );
}
