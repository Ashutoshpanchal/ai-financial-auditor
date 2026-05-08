import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>

      {isLoading && (
        <div className="animate-pulse h-[250px] rounded-lg bg-gray-100" />
      )}

      {!isLoading && error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {!isLoading && !error && data.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-10">No data available</p>
      )}

      {!isLoading && !error && data.length > 0 && (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#6b7280" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                fontSize: "12px",
              }}
              cursor={{ fill: "#f3f4f6" }}
            />
            <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
