import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "../../utils/chartTheme";

interface ChartRow {
  label: string;
  value: number;
}

interface BarChartWidgetProps {
  title: string;
  data: ChartRow[];
  isLoading?: boolean;
  error?: string | null;
}

export function BarChartWidget({
  title,
  data,
  isLoading = false,
  error = null,
}: BarChartWidgetProps) {
  const chartTheme = useChartTheme();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h3 className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</h3>

      {isLoading && (
        <div className="h-[250px] animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      )}

      {!isLoading && error && (
        <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
      )}

      {!isLoading && !error && data.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">No data available</p>
      )}

      {!isLoading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: chartTheme.tick }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: `1px solid ${chartTheme.tooltipBorder}`,
                backgroundColor: chartTheme.tooltipBg,
                color: chartTheme.tooltipText,
                fontSize: "12px",
              }}
              cursor={{ fill: chartTheme.grid }}
            />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
