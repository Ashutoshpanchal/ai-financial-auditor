import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import {
  formatCompactK,
  formatINR,
  monthShortLabel,
  ringDasharray,
} from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

const RING_COLORS = ["var(--lime)", "var(--sky)", "var(--lavender)", "var(--gold)", "var(--coral)"];

interface MonthRingsCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
}

export function MonthRingsCard({ data, isLoading }: MonthRingsCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const max = Math.max(...data.by_month.map((m) => m.debit), 1);

  return (
    <div className="de-calendar-card de-fade-in">
      <div className="de-cal-head">
        <div className="de-cal-title">Spend per month</div>
        <div>
          <div className="de-cal-total-n">{formatINR(data.totals.debits)}</div>
          <div style={{ fontSize: 10, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}>
            Total outflows
          </div>
        </div>
      </div>
      <div className="de-months-grid">
        {data.by_month.map((m, i) => {
          const { dash, gap } = ringDasharray(m.debit, max);
          const color = RING_COLORS[i % RING_COLORS.length];
          return (
            <div key={m.label} className="de-month-block">
              <div className="de-mb-ring">
                <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
                  <circle cx="26" cy="26" r="20" fill="none" stroke="var(--surface2)" strokeWidth="5" />
                  <circle
                    cx="26"
                    cy="26"
                    r="20"
                    fill="none"
                    stroke={color}
                    strokeWidth="5"
                    strokeDasharray={`${dash} ${gap}`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="de-mb-center" style={{ color }}>
                  {formatCompactK(m.debit)}
                </div>
              </div>
              <div className="de-mb-label">{monthShortLabel(m.label)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
