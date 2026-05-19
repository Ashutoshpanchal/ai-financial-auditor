import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatINR, percentOf, rankColor } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

interface RacingBarCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
}

export function RacingBarCard({ data, isLoading }: RacingBarCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const total = data.totals.debits;
  const rows = data.top_categories.slice(0, 6);
  const max = rows[0]?.value ?? 1;

  return (
    <div className="de-race-card de-fade-in">
      <div className="de-rc-head">
        <div className="de-rc-title">Where the money went</div>
        <div className="de-rc-total">{formatINR(total)}</div>
      </div>
      {rows.map((row, i) => (
        <div key={row.label} className="de-race-row">
          <span className="de-rr-rank">{String(i + 1).padStart(2, "0")}</span>
          <span className="de-rr-name">{row.label}</span>
          <div className="de-rr-track">
            <div
              className="de-rr-fill"
              style={{
                width: `${(row.value / max) * 100}%`,
                background: rankColor(i),
              }}
            />
          </div>
          <span className="de-rr-amt" style={{ color: rankColor(i) }}>
            {formatINR(row.value)} · {percentOf(row.value, total)}%
          </span>
        </div>
      ))}
    </div>
  );
}
