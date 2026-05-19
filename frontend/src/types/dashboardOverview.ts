export interface DashboardOverviewTotals {
  credits: number;
  debits: number;
  credit_count: number;
  debit_count: number;
  net: number;
}

export interface DashboardMonthRow {
  label: string;
  debit: number;
}

export interface DashboardQuarterRow {
  label: string;
  debit: number;
  months: string;
}

export interface DashboardRankRow {
  label: string;
  value: number;
}

export interface DashboardOverviewData {
  totals: DashboardOverviewTotals;
  by_month: DashboardMonthRow[];
  by_quarter: DashboardQuarterRow[];
  top_categories: DashboardRankRow[];
  top_descriptions: DashboardRankRow[];
  investment_debits: number;
}
