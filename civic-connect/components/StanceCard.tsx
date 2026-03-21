interface StanceCardProps {
  party: "Democrat" | "Republican";
  position: string;
  voteYes: number;
  voteNo: number;
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
  source,
}: StanceCardProps) {
  const config = PARTY_CONFIG[party];
  const total = voteYes + voteNo;
  const yesPct = total > 0 ? Math.round((voteYes / total) * 100) : 0;

  return (
    <div className={`rounded-card border-2 p-6 ${config.light} flex flex-col gap-4`}>
      <div className="flex items-center gap-2">
        <h4 className={`font-bold text-base ${config.text}`}>{config.label}</h4>
      </div>

      {position && (
        <p className="text-sm text-gray-700 leading-relaxed">{position}</p>
      )}

      {total > 0 && (
        <div>
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Voted Yes: {voteYes}</span>
            <span>Voted No: {voteNo}</span>
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

      <p className="text-xs text-gray-400 capitalize">Source: {source.replace("_", " ")}</p>
    </div>
  );
}
