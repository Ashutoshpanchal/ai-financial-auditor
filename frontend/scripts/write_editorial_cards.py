#!/usr/bin/env python3
"""Generate dashboard editorial card components."""

from pathlib import Path

CARDS = Path(__file__).resolve().parent.parent / "src/components/dashboard/cards"
D = "div"


def write(name: str, content: str) -> None:
    (CARDS / name).write_text(content.strip() + "\n", encoding="utf-8")


write(
    "EditorialOverviewCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatINR, formatLakh }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

interface EditorialOverviewCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
}}

export function EditorialOverviewCard({{
  data,
  isLoading,
  periodLabel,
}}: EditorialOverviewCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[220px]" />;

  const {{ totals, by_quarter }} = data;
  const maxQ = Math.max(...by_quarter.map((q) => q.debit), 1);
  const activeQ = by_quarter.reduce(
    (best, q) => (q.debit > best.debit ? q : best),
    by_quarter[0],
  );

  return (
    <{D} className="de-editorial-grid de-fade-in">
      <{D} className="de-ed-main">
        <{D}>
          <{D} className="de-ed-eyebrow">Statement · {{periodLabel}}</{D}>
          <{D} className="de-ed-headline">
            <em>Total</em>
            <br />
            money
            <br />
            in
          </{D}>
        </{D}>
        <{D} className="de-ed-foot">
          <{D}>
            <{D} className="de-ed-foot-val">{{totals.credits.toLocaleString("en-IN")}}</{D}>
            <{D} style={{{{ fontSize: 12, color: "var(--t3)", marginTop: 4 }}}}>
              Indian Rupees deposited
            </{D}>
          </{D}>
          <{D} className="de-ed-foot-label">
            {{totals.credit_count}} credit
            <br />
            transactions
          </{D}>
        </{D}>
      </{D}>
      <{D} className="de-ed-side">
        <{D} className="de-ed-cell">
          <{D} className="de-ed-cell-l">Withdrawn</{D}>
          <{D} className="de-ed-cell-v" style={{{{ color: "var(--coral)" }}}}>
            {{formatLakh(totals.debits)}}
          </{D}>
          <{D} className="de-ed-cell-sub">{{totals.debit_count.toLocaleString("en-IN")}} debits</{D}>
        </{D}>
        <{D} className="de-ed-cell">
          <{D} className="de-ed-cell-l">Net flow</{D}>
          <{D} className="de-ed-cell-v" style={{{{ color: "var(--sky)" }}}}>
            {{formatLakh(totals.net)}}
          </{D}>
          <{D} className="de-ed-cell-sub">Credits − debits</{D}>
        </{D}>
        <{D} className="de-ed-cell">
          <{D} className="de-ed-cell-l">Investments</{D}>
          <{D} className="de-ed-cell-v" style={{{{ color: "var(--gold)" }}}}>
            {{formatLakh(data.investment_debits)}}
          </{D}>
          <{D} className="de-ed-cell-sub">Tagged investment debits</{D}>
        </{D}>
      </{D}>
      <{D} className="de-ed-right">
        {{by_quarter.map((q) => {{
          const isActive = q.label === activeQ?.label && q.debit === maxQ && maxQ > 0;
          return (
            <{D} key={{q.label}} className={{`de-ed-quarter${{isActive ? " active" : ""}}`}}>
              <{D} className="de-ed-q-n" style={{!isActive ? {{ color: "var(--t2)" }} : undefined}}>
                {{q.label}}
              </{D}>
              <{D} className="de-ed-q-l">
                {{q.months}} · {{formatINR(q.debit)}}
              </{D}>
            </{D}>
          );
        }})}}
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "BrutalistTickerCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatINR, percentOf }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

const TICKER_COLORS = ["var(--lime)", "var(--sky)", "var(--gold)", "var(--lavender)", "var(--coral)"];

interface BrutalistTickerCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
}}

export function BrutalistTickerCard({{ data, isLoading }}: BrutalistTickerCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[180px]" />;

  const {{ totals, top_descriptions, investment_debits }} = data;
  const investPct = percentOf(investment_debits, totals.debits);
  const items = top_descriptions.length > 0 ? top_descriptions : [{{ label: "—", value: 0 }}];
  const doubled = [...items, ...items];

  return (
    <{D} className="de-ticker-card de-fade-in">
      <{D} className="de-ticker-top">
        <{D} className="de-tt-block">
          <{D} className="de-tt-label">Total deposited</{D}>
          <{D} className="de-tt-val" style={{{{ color: "var(--lime)" }}}}>{{formatINR(totals.credits)}}</{D}>
          <{D} className="de-tt-change de-tt-up">↑ {{totals.credit_count}} credits</{D}>
        </{D}>
        <{D} className="de-tt-block">
          <{D} className="de-tt-label">Total withdrawn</{D}>
          <{D} className="de-tt-val" style={{{{ color: "var(--coral)" }}}}>{{formatINR(totals.debits)}}</{D}>
          <{D} className="de-tt-change de-tt-down">↓ {{totals.debit_count}} debits</{D}>
        </{D}>
        <{D} className="de-tt-block">
          <{D} className="de-tt-label">Net position</{D}>
          <{D} className="de-tt-val" style={{{{ color: "var(--sky)" }}}}>{{formatINR(totals.net)}}</{D}>
          <{D} className={{`de-tt-change ${{totals.net >= 0 ? "de-tt-up" : "de-tt-down"}}`}}>
            {{totals.net >= 0 ? "↑" : "↓"}} net flow
          </{D}>
        </{D}>
        <{D} className="de-tt-block">
          <{D} className="de-tt-label">Investments</{D}>
          <{D} className="de-tt-val" style={{{{ color: "var(--lavender)" }}}}>{{formatINR(investment_debits)}}</{D}>
          <{D} className="de-tt-change de-tt-up">↑ {{investPct}}% of outflows</{D}>
        </{D}>
      </{D}>
      <{D} className="de-ticker-bottom">
        <{D} className="de-ticker-track">
          {{doubled.map((item, i) => (
            <{D} key={{`${{item.label}}-${{i}}`}} className="de-ticker-item">
              <{D}
                className="de-ticker-dot"
                style={{{{ background: TICKER_COLORS[i % TICKER_COLORS.length] }}}}
              />
              {{item.label}}{" "}
              <span style={{{{ color: TICKER_COLORS[i % TICKER_COLORS.length] }}}}>
                {{formatINR(item.value)}}
              </span>
            </{D}>
          ))}}
        </{D}>
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "SwissRankingCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatINR, rankColor }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

interface SwissRankingCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
}}

export function SwissRankingCard({{ data, isLoading }}: SwissRankingCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const total = data.totals.debits;
  const rows = data.top_categories.slice(0, 5);
  const max = rows[0]?.value ?? 1;

  return (
    <{D} className="de-swiss-card de-fade-in">
      <{D} className="de-sw-header">
        <{D} className="de-sw-title">SPEND RANKING</{D}>
        <{D} className="de-sw-period">{{formatINR(total)}} total</{D}>
      </{D}>
      <{D}>
        {{rows.map((row, i) => (
          <{D} key={{row.label}} className="de-sw-row">
            <{D} className="de-sw-idx">{{String(i + 1).padStart(2, "0")}} TOP</{D}>
            <{D} className="de-sw-bar-wrap">
              <{D}
                className="de-sw-bar"
                style={{{{
                  width: `${{(row.value / max) * 100}}%`,
                  background: rankColor(i),
                }}}}
              />
            </{D}>
            <{D} className="de-sw-val" style={{{{ color: rankColor(i) }}}}>{{formatINR(row.value)}}</{D}>
            <{D} className="de-sw-name">{{row.label}}</{D}>
          </{D}>
        ))}}
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "LiquidMetricTriplet.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatLakh, percentOf }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

interface LiquidMetricTripletProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
}}

export function LiquidMetricTriplet({{ data, isLoading, periodLabel }}: LiquidMetricTripletProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[190px]" />;

  const {{ totals, investment_debits }} = data;
  const investPct = percentOf(investment_debits, totals.debits);

  return (
    <{D} className="de-liquid-grid de-fade-in">
      <{D} className="de-liquid-card de-lca">
        <{D} className="de-lc-blob de-lc-b1" style={{{{ background: "radial-gradient(circle,rgba(198,255,0,0.3),transparent)" }}}} />
        <{D} className="de-lc-blob de-lc-b2" style={{{{ background: "radial-gradient(circle,rgba(198,255,0,0.2),transparent)" }}}} />
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} className="de-lc-label" style={{{{ color: "rgba(198,255,0,0.5)" }}}}>Annual income</{D}>
          <{D} className="de-lc-val" style={{{{ color: "var(--lime)" }}}}>
            {{formatLakh(totals.credits)}}
          </{D}>
        </{D}>
        <{D} className="de-lc-bot">
          <span className="de-lc-sub" style={{{{ color: "rgba(255,255,255,0.35)" }}}}>{{periodLabel}}</span>
          <span className="de-lc-badge" style={{{{ background: "rgba(198,255,0,0.1)", color: "var(--lime)", border: "1px solid rgba(198,255,0,0.2)" }}}}>
            +{{totals.credit_count}} credits
          </span>
        </{D}>
      </{D}>
      <{D} className="de-liquid-card de-lcb">
        <{D} className="de-lc-blob de-lc-b1" style={{{{ background: "radial-gradient(circle,rgba(157,120,248,0.35),transparent)" }}}} />
        <{D} className="de-lc-blob de-lc-b2" style={{{{ background: "radial-gradient(circle,rgba(157,120,248,0.2),transparent)" }}}} />
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} className="de-lc-label" style={{{{ color: "rgba(157,120,248,0.5)" }}}}>Investments</{D}>
          <{D} className="de-lc-val" style={{{{ color: "var(--lavender)" }}}}>
            {{formatLakh(investment_debits)}}
          </{D}>
        </{D}>
        <{D} className="de-lc-bot">
          <span className="de-lc-sub" style={{{{ color: "rgba(255,255,255,0.35)" }}}}>{{investPct}}% of spend</span>
          <span className="de-lc-badge" style={{{{ background: "rgba(157,120,248,0.1)", color: "var(--lavender)", border: "1px solid rgba(157,120,248,0.2)" }}}}>
            SIP / funds
          </span>
        </{D}>
      </{D}>
      <{D} className="de-liquid-card de-lcc">
        <{D} className="de-lc-blob de-lc-b1" style={{{{ background: "radial-gradient(circle,rgba(255,79,79,0.3),transparent)" }}}} />
        <{D} className="de-lc-blob de-lc-b2" style={{{{ background: "radial-gradient(circle,rgba(255,79,79,0.2),transparent)" }}}} />
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} className="de-lc-label" style={{{{ color: "rgba(255,79,79,0.5)" }}}}>Total withdrawn</{D}>
          <{D} className="de-lc-val" style={{{{ color: "var(--coral)" }}}}>
            {{formatLakh(totals.debits)}}
          </{D}>
        </{D}>
        <{D} className="de-lc-bot">
          <span className="de-lc-sub" style={{{{ color: "rgba(255,255,255,0.35)" }}}}>{{totals.debit_count.toLocaleString("en-IN")}} debits</span>
          <span className="de-lc-badge" style={{{{ background: "rgba(255,79,79,0.1)", color: "var(--coral)", border: "1px solid rgba(255,79,79,0.2)" }}}}>
            {{periodLabel}}
          </span>
        </{D}>
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "RacingBarCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatINR, percentOf, rankColor }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

interface RacingBarCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
}}

export function RacingBarCard({{ data, isLoading }}: RacingBarCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const total = data.totals.debits;
  const rows = data.top_categories.slice(0, 6);
  const max = rows[0]?.value ?? 1;

  return (
    <{D} className="de-race-card de-fade-in">
      <{D} className="de-rc-head">
        <{D} className="de-rc-title">Where the money went</{D}>
        <{D} className="de-rc-total">{{formatINR(total)}}</{D}>
      </{D}>
      {{rows.map((row, i) => (
        <{D} key={{row.label}} className="de-race-row">
          <span className="de-rr-rank">{{String(i + 1).padStart(2, "0")}}</span>
          <span className="de-rr-name">{{row.label}}</span>
          <{D} className="de-rr-track">
            <{D}
              className="de-rr-fill"
              style={{{{
                width: `${{(row.value / max) * 100}}%`,
                background: rankColor(i),
              }}}}
            />
          </{D}>
          <span className="de-rr-amt" style={{{{ color: rankColor(i) }}}}>
            {{formatINR(row.value)}} · {{percentOf(row.value, total)}}%
          </span>
        </{D}>
      ))}}
    </{D}>
  );
}}
""",
)

write(
    "CreditPairCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ formatINR }} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

interface CreditPairCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
  periodLabel: string;
  holderName?: string | null;
  bankLabel?: string | null;
}}

export function CreditPairCard({{
  data,
  isLoading,
  periodLabel,
  holderName,
  bankLabel,
}}: CreditPairCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[185px]" />;

  const logo = (bankLabel ?? "BANK").slice(0, 12).toUpperCase();
  const holder = holderName ?? "Account holder";

  return (
    <{D} className="de-cards-row de-fade-in">
      <{D} className="de-credit-card de-cc-deposit">
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} style={{{{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: 2, color: "var(--lime)" }}}}>
            {{logo}}
          </{D}>
        </{D}>
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} className="de-cc-main-val">{{formatINR(data.totals.credits)}}</{D}>
        </{D}>
        <{D} style={{{{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}}}>
          <{D}>
            <{D} style={{{{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}}}>
              {{holder}}
            </{D}>
            <{D} style={{{{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}}}>Deposited · {{periodLabel}}</{D}>
          </{D}>
        </{D}>
      </{D}>
      <{D} className="de-credit-card de-cc-spend">
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} style={{{{ fontFamily: "var(--font-display)", fontSize: 18, letterSpacing: 2, color: "var(--coral)" }}}}>
            {{logo}}
          </{D}>
        </{D}>
        <{D} style={{{{ position: "relative", zIndex: 1 }}}}>
          <{D} className="de-cc-main-val">{{formatINR(data.totals.debits)}}</{D}>
        </{D}>
        <{D} style={{{{ position: "relative", zIndex: 1, display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}}}>
          <{D}>
            <{D} style={{{{ fontSize: 11, fontWeight: 600, letterSpacing: 1.5, textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}}}>
              {{holder}}
            </{D}>
            <{D} style={{{{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}}}>Withdrawn · {{periodLabel}}</{D}>
          </{D}>
        </{D}>
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "MonthRingsCard.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{
  formatCompactK,
  formatINR,
  monthShortLabel,
  ringDasharray,
}} from "../../../utils/financeDisplay";
import {{ CardSkeleton }} from "./CardSkeleton";

const RING_COLORS = ["var(--lime)", "var(--sky)", "var(--lavender)", "var(--gold)", "var(--coral)"];

interface MonthRingsCardProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
}}

export function MonthRingsCard({{ data, isLoading }}: MonthRingsCardProps) {{
  if (isLoading || !data) return <CardSkeleton className="min-h-[200px]" />;

  const max = Math.max(...data.by_month.map((m) => m.debit), 1);

  return (
    <{D} className="de-calendar-card de-fade-in">
      <{D} className="de-cal-head">
        <{D} className="de-cal-title">Spend per month</{D}>
        <{D}>
          <{D} className="de-cal-total-n">{{formatINR(data.totals.debits)}}</{D}>
          <{D} style={{{{ fontSize: 10, color: "var(--t3)", letterSpacing: 1, textTransform: "uppercase", textAlign: "right" }}}}>
            Total outflows
          </{D}>
        </{D}>
      </{D}>
      <{D} className="de-months-grid">
        {{data.by_month.map((m, i) => {{
          const {{ dash, gap }} = ringDasharray(m.debit, max);
          const color = RING_COLORS[i % RING_COLORS.length];
          return (
            <{D} key={{m.label}} className="de-month-block">
              <{D} className="de-mb-ring">
                <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
                  <circle cx="26" cy="26" r="20" fill="none" stroke="#1a1a28" strokeWidth="5" />
                  <circle
                    cx="26"
                    cy="26"
                    r="20"
                    fill="none"
                    stroke={{color}}
                    strokeWidth="5"
                    strokeDasharray={{`${{dash}} ${{gap}}`}}
                    strokeLinecap="round"
                  />
                </svg>
                <{D} className="de-mb-center" style={{{{ color }}}}>
                  {{formatCompactK(m.debit)}}
                </{D}>
              </{D}>
              <{D} className="de-mb-label">{{monthShortLabel(m.label)}}</{D}>
            </{D}>
          );
        }})}}
      </{D}>
    </{D}>
  );
}}
""",
)

write(
    "DashboardOverview.tsx",
    f"""
import type {{ DashboardOverviewData }} from "../../../types/dashboardOverview";
import {{ BrutalistTickerCard }} from "./BrutalistTickerCard";
import {{ CreditPairCard }} from "./CreditPairCard";
import {{ EditorialOverviewCard }} from "./EditorialOverviewCard";
import {{ LiquidMetricTriplet }} from "./LiquidMetricTriplet";
import {{ MonthRingsCard }} from "./MonthRingsCard";
import {{ RacingBarCard }} from "./RacingBarCard";
import {{ SectionHeader }} from "./SectionHeader";
import {{ SwissRankingCard }} from "./SwissRankingCard";

interface DashboardOverviewProps {{
  data: DashboardOverviewData | null;
  isLoading: boolean;
  error: string | null;
  periodLabel: string;
  holderName?: string | null;
  bankLabel?: string | null;
}}

export function DashboardOverview({{
  data,
  isLoading,
  error,
  periodLabel,
  holderName,
  bankLabel,
}}: DashboardOverviewProps) {{
  if (error) {{
    return (
      <{D} className="rounded-xl border border-red-500/30 bg-red-950/30 p-6 text-sm text-red-300">
        Failed to load overview: {{error}}
      </{D}>
    );
  }}

  return (
    <>
      <SectionHeader number="01" tag="Editorial newspaper" />
      <EditorialOverviewCard data={{data}} isLoading={{isLoading}} periodLabel={{periodLabel}} />

      <SectionHeader number="02" tag="Brutalist ticker" />
      <BrutalistTickerCard data={{data}} isLoading={{isLoading}} />

      <SectionHeader number="03" tag="Swiss grid ranking" />
      <SwissRankingCard data={{data}} isLoading={{isLoading}} />

      <SectionHeader number="04" tag="Liquid blob cards" />
      <LiquidMetricTriplet data={{data}} isLoading={{isLoading}} periodLabel={{periodLabel}} />

      <SectionHeader number="05" tag="Racing bar ranking" />
      <RacingBarCard data={{data}} isLoading={{isLoading}} />

      <SectionHeader number="06" tag="Premium physical card" />
      <CreditPairCard
        data={{data}}
        isLoading={{isLoading}}
        periodLabel={{periodLabel}}
        holderName={{holderName}}
        bankLabel={{bankLabel}}
      />

      <SectionHeader number="07" tag="Month ring calendar" />
      <MonthRingsCard data={{data}} isLoading={{isLoading}} />
    </>
  );
}}
""",
)

print("Wrote card components to", CARDS)
