import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatLakh, percentOf } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

interface LiquidMetricTripletProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
}

export function LiquidMetricTriplet({ data, isLoading, periodLabel }: LiquidMetricTripletProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[190px]" />;

  const { totals, investment_debits } = data;
  const investPct = percentOf(investment_debits, totals.debits);

  return (
    <div className="de-liquid-grid de-fade-in">
      <div className="de-liquid-card de-lca">
        <div className="de-lc-blob de-lc-b1" style={{ background: "radial-gradient(circle,rgba(198,255,0,0.3),transparent)" }} />
        <div className="de-lc-blob de-lc-b2" style={{ background: "radial-gradient(circle,rgba(198,255,0,0.2),transparent)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="de-lc-label" style={{ color: "rgba(198,255,0,0.5)" }}>Annual income</div>
          <div className="de-lc-val" style={{ color: "var(--lime)" }}>
            {formatLakh(totals.credits)}
          </div>
        </div>
        <div className="de-lc-bot">
          <span className="de-lc-sub" style={{ color: "rgba(255,255,255,0.35)" }}>{periodLabel}</span>
          <span className="de-lc-badge" style={{ background: "rgba(198,255,0,0.1)", color: "var(--lime)", border: "1px solid rgba(198,255,0,0.2)" }}>
            +{totals.credit_count} credits
          </span>
        </div>
      </div>
      <div className="de-liquid-card de-lcb">
        <div className="de-lc-blob de-lc-b1" style={{ background: "radial-gradient(circle,rgba(157,120,248,0.35),transparent)" }} />
        <div className="de-lc-blob de-lc-b2" style={{ background: "radial-gradient(circle,rgba(157,120,248,0.2),transparent)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="de-lc-label" style={{ color: "rgba(157,120,248,0.5)" }}>Investments</div>
          <div className="de-lc-val" style={{ color: "var(--lavender)" }}>
            {formatLakh(investment_debits)}
          </div>
        </div>
        <div className="de-lc-bot">
          <span className="de-lc-sub" style={{ color: "rgba(255,255,255,0.35)" }}>{investPct}% of spend</span>
          <span className="de-lc-badge" style={{ background: "rgba(157,120,248,0.1)", color: "var(--lavender)", border: "1px solid rgba(157,120,248,0.2)" }}>
            SIP / funds
          </span>
        </div>
      </div>
      <div className="de-liquid-card de-lcc">
        <div className="de-lc-blob de-lc-b1" style={{ background: "radial-gradient(circle,rgba(255,79,79,0.3),transparent)" }} />
        <div className="de-lc-blob de-lc-b2" style={{ background: "radial-gradient(circle,rgba(255,79,79,0.2),transparent)" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="de-lc-label" style={{ color: "rgba(255,79,79,0.5)" }}>Total withdrawn</div>
          <div className="de-lc-val" style={{ color: "var(--coral)" }}>
            {formatLakh(totals.debits)}
          </div>
        </div>
        <div className="de-lc-bot">
          <span className="de-lc-sub" style={{ color: "rgba(255,255,255,0.35)" }}>{totals.debit_count.toLocaleString("en-IN")} debits</span>
          <span className="de-lc-badge" style={{ background: "rgba(255,79,79,0.1)", color: "var(--coral)", border: "1px solid rgba(255,79,79,0.2)" }}>
            {periodLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
