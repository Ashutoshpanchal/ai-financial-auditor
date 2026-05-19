import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatINR, formatLakh } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

interface EditorialOverviewCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
}

export function EditorialOverviewCard({
  data,
  isLoading,
  periodLabel,
}: EditorialOverviewCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[220px]" />;

  const { totals, by_quarter } = data;
  const maxQ = Math.max(...by_quarter.map((q) => q.debit), 1);
  const activeQ = by_quarter.reduce(
    (best, q) => (q.debit > best.debit ? q : best),
    by_quarter[0],
  );

  return (
    <div className="de-editorial-grid de-fade-in">
      <div className="de-ed-main">
        <div>
          <div className="de-ed-eyebrow">Statement · {periodLabel}</div>
          <div className="de-ed-headline">
            <em>Total</em>
            <br />
            money
            <br />
            in
          </div>
        </div>
        <div className="de-ed-foot">
          <div>
            <div className="de-ed-foot-val">{totals.credits.toLocaleString("en-IN")}</div>
            <div style={{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}>
              Indian Rupees deposited
            </div>
          </div>
          <div className="de-ed-foot-label">
            {totals.credit_count} credit
            <br />
            transactions
          </div>
        </div>
      </div>
      <div className="de-ed-side">
        <div className="de-ed-cell">
          <div className="de-ed-cell-l">Withdrawn</div>
          <div className="de-ed-cell-v" style={{ color: "var(--coral)" }}>
            {formatLakh(totals.debits)}
          </div>
          <div className="de-ed-cell-sub">{totals.debit_count.toLocaleString("en-IN")} debits</div>
        </div>
        <div className="de-ed-cell">
          <div className="de-ed-cell-l">Net flow</div>
          <div className="de-ed-cell-v" style={{ color: "var(--sky)" }}>
            {formatLakh(totals.net)}
          </div>
          <div className="de-ed-cell-sub">Credits − debits</div>
        </div>
        <div className="de-ed-cell">
          <div className="de-ed-cell-l">Investments</div>
          <div className="de-ed-cell-v" style={{ color: "var(--gold)" }}>
            {formatLakh(data.investment_debits)}
          </div>
          <div className="de-ed-cell-sub">Tagged investment debits</div>
        </div>
      </div>
      <div className="de-ed-right">
        {by_quarter.map((q) => {
          const isActive = q.label === activeQ?.label && q.debit === maxQ && maxQ > 0;
          return (
            <div key={q.label} className={`de-ed-quarter${isActive ? " active" : ""}`}>
              <div className="de-ed-q-n" style={!isActive ? { color: "var(--t2)" } : undefined}>
                {q.label}
              </div>
              <div className="de-ed-q-l">
                {q.months} · {formatINR(q.debit)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
