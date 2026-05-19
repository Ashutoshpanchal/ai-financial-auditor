import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatINR, percentOf } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

const TICKER_COLORS = ["var(--lime)", "var(--sky)", "var(--gold)", "var(--lavender)", "var(--coral)"];

interface BrutalistTickerCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
}

export function BrutalistTickerCard({ data, isLoading }: BrutalistTickerCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[180px]" />;

  const { totals, top_descriptions, investment_debits } = data;
  const investPct = percentOf(investment_debits, totals.debits);
  const items = top_descriptions.length > 0 ? top_descriptions : [{ label: "—", value: 0 }];
  const doubled = [...items, ...items];

  return (
    <div className="de-ticker-card de-fade-in">
      <div className="de-ticker-top">
        <div className="de-tt-block">
          <div className="de-tt-label">Total deposited</div>
          <div className="de-tt-val" style={{ color: "var(--lime)" }}>{formatINR(totals.credits)}</div>
          <div className="de-tt-change de-tt-up">↑ {totals.credit_count} credits</div>
        </div>
        <div className="de-tt-block">
          <div className="de-tt-label">Total withdrawn</div>
          <div className="de-tt-val" style={{ color: "var(--coral)" }}>{formatINR(totals.debits)}</div>
          <div className="de-tt-change de-tt-down">↓ {totals.debit_count} debits</div>
        </div>
        <div className="de-tt-block">
          <div className="de-tt-label">Net position</div>
          <div className="de-tt-val" style={{ color: "var(--sky)" }}>{formatINR(totals.net)}</div>
          <div className={`de-tt-change ${totals.net >= 0 ? "de-tt-up" : "de-tt-down"}`}>
            {totals.net >= 0 ? "↑" : "↓"} net flow
          </div>
        </div>
        <div className="de-tt-block">
          <div className="de-tt-label">Investments</div>
          <div className="de-tt-val" style={{ color: "var(--lavender)" }}>{formatINR(investment_debits)}</div>
          <div className="de-tt-change de-tt-up">↑ {investPct}% of outflows</div>
        </div>
      </div>
      <div className="de-ticker-bottom">
        <div className="de-ticker-track">
          {doubled.map((item, i) => (
            <div key={`${item.label}-${i}`} className="de-ticker-item">
              <div
                className="de-ticker-dot"
                style={{ background: TICKER_COLORS[i % TICKER_COLORS.length] }}
              />
              {item.label} 
              <span style={{ color: TICKER_COLORS[i % TICKER_COLORS.length] }}>
                {formatINR(item.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
