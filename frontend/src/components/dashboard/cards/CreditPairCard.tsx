import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { formatINR } from "../../../utils/financeDisplay";
import { CardSkeleton } from "./CardSkeleton";

interface CreditPairCardProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
  holderName?: string | null;
  bankLabel?: string | null;
}

export function CreditPairCard({
  data,
  isLoading,
  periodLabel,
  holderName,
  bankLabel,
}: CreditPairCardProps) {
  if (isLoading || !data) return <CardSkeleton className="min-h-[185px]" />;

  const logo = (bankLabel ?? "BANK").slice(0, 12).toUpperCase();
  const holder = holderName ?? "Account holder";

  return (
    <div className="de-cards-row de-fade-in">
      <div className="de-credit-card de-cc-deposit">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: 2, color: "var(--lime)" }}>
            {logo}
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="de-cc-main-val">{formatINR(data.totals.credits)}</div>
        </div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {holder}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Deposited · {periodLabel}</div>
          </div>
        </div>
      </div>
      <div className="de-credit-card de-cc-spend">
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: 2, color: "var(--coral)" }}>
            {logo}
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="de-cc-main-val">{formatINR(data.totals.debits)}</div>
        </div>
        <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>
              {holder}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>Withdrawn · {periodLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
