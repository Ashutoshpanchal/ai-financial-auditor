import type { DashboardOverviewData } from "../../../types/dashboardOverview";
import { BrutalistTickerCard } from "./BrutalistTickerCard";
import { CreditPairCard } from "./CreditPairCard";
import { EditorialOverviewCard } from "./EditorialOverviewCard";
import { LiquidMetricTriplet } from "./LiquidMetricTriplet";
import { MonthRingsCard } from "./MonthRingsCard";
import { RacingBarCard } from "./RacingBarCard";
import { SectionHeader } from "./SectionHeader";
import { SwissRankingCard } from "./SwissRankingCard";

interface DashboardOverviewProps {
  data: DashboardOverviewData | null;
  isLoading: boolean;
  error: string | null;
  periodLabel: string;
  holderName?: string | null;
  bankLabel?: string | null;
}

export function DashboardOverview({
  data,
  isLoading,
  error,
  periodLabel,
  holderName,
  bankLabel,
}: DashboardOverviewProps) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-300">
        Failed to load overview: {error}
      </div>
    );
  }

  return (
    <>
      <SectionHeader number="01" tag="Editorial newspaper" />
      <EditorialOverviewCard data={data} isLoading={isLoading} periodLabel={periodLabel} />

      <SectionHeader number="02" tag="Brutalist ticker" />
      <BrutalistTickerCard data={data} isLoading={isLoading} />

      <SectionHeader number="03" tag="Swiss grid ranking" />
      <SwissRankingCard data={data} isLoading={isLoading} />

      <SectionHeader number="04" tag="Liquid blob cards" />
      <LiquidMetricTriplet data={data} isLoading={isLoading} periodLabel={periodLabel} />

      <SectionHeader number="05" tag="Racing bar ranking" />
      <RacingBarCard data={data} isLoading={isLoading} />

      <SectionHeader number="06" tag="Premium physical card" />
      <CreditPairCard
        data={data}
        isLoading={isLoading}
        periodLabel={periodLabel}
        holderName={holderName}
        bankLabel={bankLabel}
      />

      <SectionHeader number="07" tag="Month ring calendar" />
      <MonthRingsCard data={data} isLoading={isLoading} />
    </>
  );
}
