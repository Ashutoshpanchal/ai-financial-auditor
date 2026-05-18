import { useTheme } from "../contexts/ThemeContext";

export interface ChartThemeColors {
  tick: string;
  grid: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
}

const LIGHT: ChartThemeColors = {
  tick: "#6b7280",
  grid: "#e5e7eb",
  tooltipBg: "#ffffff",
  tooltipBorder: "#e5e7eb",
  tooltipText: "#111827",
};

const DARK: ChartThemeColors = {
  tick: "#9ca3af",
  grid: "#374151",
  tooltipBg: "#111827",
  tooltipBorder: "#374151",
  tooltipText: "#f3f4f6",
};

/** Returns Recharts-friendly colors for the active app theme. */
export function useChartTheme(): ChartThemeColors {
  const { theme } = useTheme();
  return theme === "dark" ? DARK : LIGHT;
}
