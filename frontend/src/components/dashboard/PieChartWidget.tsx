import {
  PieChart,
  Pie,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { useChartTheme } from "../../utils/chartTheme";

interface ChartRow {
  label: string;
  value: number;
}

interface PieChartWidgetProps {
  title: string;
  data: ChartRow[];
  isLoading?: boolean;
  error?: string | null;
}

const COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center" style={{ height: 280 }}>
      <div className="h-40 w-40 animate-pulse rounded-full bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

export function PieChartWidget({
  title,
  data,
  isLoading = false,
  error = null,
}: PieChartWidgetProps) {
  const chartTheme = useChartTheme();

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <h2 className="mb-4 text-base font-semibold text-gray-800 dark:text-gray-100">{title}</h2>

      {isLoading ? (
        <LoadingPlaceholder />
      ) : error ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <p className="text-sm text-gray-400 dark:text-gray-500">No data available</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={100}
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [value.toLocaleString("en-IN"), "Amount"]}
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${chartTheme.tooltipBorder}`,
                backgroundColor: chartTheme.tooltipBg,
                color: chartTheme.tooltipText,
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(val: string) => (
                <span style={{ fontSize: 12, color: chartTheme.tick }}>{val}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default PieChartWidget;
