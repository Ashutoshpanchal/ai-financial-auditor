import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatINR, rankColor } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

interface SwissRankingCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
}

export function SwissRankingCard({ data, isLoading }: SwissRankingCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const total = data.totals.debits;
  const rows = data.top_categories.slice(0, 5);
  const max = rows[0]?.value ?? 1;

  return (
    <div className="de-swiss-card de-fade-in">
      <div className="de-sw-header">
        <div className="de-sw-title">SPEND RANKING</div>
        <div className="de-sw-period">{formatINR(total)} total</div>
      </div>
      <div>
        {rows.map((row, i) => (
          <div key={row.label} className="de-sw-row">
            <div className="de-sw-idx">{String(i + 1).padStart(2, "0")} TOP</div>
            <div className="de-sw-bar-wrap">
              <div
                className="de-sw-bar"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  background: rankColor(i),
                }}
              />
            </div>
            <div className="de-sw-val" style={{ color: rankColor(i) }}>{formatINR(row.value)}</div>
            <div className="de-sw-name">{row.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
