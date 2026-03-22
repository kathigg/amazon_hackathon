interface StanceCardProps {
  party: "Democrat" | "Republican";
  position: string;
  voteYes: number;
  voteNo: number;
  cosponsors: number;
  source: string;
}

const PARTY_CONFIG = {
  Democrat: {
    color: "bg-civic-blue",
    light: "bg-blue-50 border-blue-200",
    text: "text-civic-blue",
    label: "Democratic Party",
  },
  Republican: {
    color: "bg-civic-red",
    light: "bg-red-50 border-red-200",
    text: "text-civic-red",
    label: "Republican Party",
  },
};

export default function StanceCard({
  party,
  position,
  voteYes,
  voteNo,
  cosponsors,
  source,
}: StanceCardProps) {
  const config = PARTY_CONFIG[party];
  const voteTotal = voteYes + voteNo;
  const yesPct = voteTotal > 0 ? Math.round((voteYes / voteTotal) * 100) : 0;
  const hasVotes = voteTotal > 0;
  const hasCosponsors = cosponsors > 0;

  return (
    <div className={`rounded-card border-2 p-6 ${config.light} flex flex-col gap-4`}>
      <h4 className={`font-bold text-base ${config.text}`}>{config.label}</h4>

      {position && (
        <p className="text-sm text-gray-700 leading-relaxed">{position}</p>
      )}

      {/* Cosponsor endorsements */}
      {hasCosponsors && (
        <div className="flex items-center gap-3 p-3 bg-white/60 rounded-xl">
          <div className={`w-8 h-8 rounded-full ${config.color} flex items-center justify-center shrink-0`}>
            <span className="text-white text-xs font-bold">✓</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-navy">
              {cosponsors} member{cosponsors !== 1 ? "s" : ""} formally endorsed
            </p>
            <p className="text-xs text-gray-500">Cosponsored this bill</p>
          </div>
        </div>
      )}

      {/* Roll call vote breakdown */}
      {hasVotes && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Roll Call Vote
          </p>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Yea: {voteYes}</span>
            <span>Nay: {voteNo}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${config.color}`}
              style={{ width: `${yesPct}%` }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">{yesPct}% voted in favor</p>
        </div>
      )}

      {!hasVotes && !hasCosponsors && (
        <p className="text-xs text-gray-400 italic">No position data available yet</p>
      )}

      <p className="text-xs text-gray-400 capitalize">
        Source: {source.replace(/_/g, " ")}
      </p>
    </div>
  );
}
