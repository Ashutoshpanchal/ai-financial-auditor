import {
  PieChart,
  Pie,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Constants ────────────────────────────────────────────────────────────────

const COLORS = [
  "#6366f1", // indigo-500
  "#10b981", // emerald-500
  "#f59e0b", // amber-500
  "#ef4444", // red-500
  "#3b82f6", // blue-500
  "#8b5cf6", // violet-500
  "#ec4899", // pink-500
];

// ─── Loading placeholder ──────────────────────────────────────────────────────

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center" style={{ height: 280 }}>
      <div className="w-40 h-40 rounded-full bg-gray-200 animate-pulse" />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PieChartWidget({
  title,
  data,
  isLoading = false,
  error = null,
}: PieChartWidgetProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800 mb-4">{title}</h2>

      {isLoading ? (
        <LoadingPlaceholder />
      ) : error ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : data.length === 0 ? (
        <div className="flex items-center justify-center" style={{ height: 280 }}>
          <p className="text-sm text-gray-400">No data available</p>
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
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => [
                `$${value.toLocaleString()}`,
                "Amount",
              ]}
              contentStyle={{
                borderRadius: 8,
                border: "none",
                boxShadow: "0 4px 16px rgba(0,0,0,.08)",
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(val: string) => (
                <span style={{ fontSize: 12, color: "#6b7280" }}>{val}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

export default PieChartWidget;
