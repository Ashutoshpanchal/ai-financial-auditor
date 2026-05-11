interface MetricCardProps {
  title: string;
  value: number;
  format: "currency" | "number";
  isLoading?: boolean;
  error?: string | null;
}

function formatValue(value: number, format: "currency" | "number"): string {
  if (format === "currency") {
    return value.toLocaleString("en-IN");
  }
  return value.toLocaleString();
}

export function MetricCard({ title, value, format, isLoading = false, error = null }: MetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>

      {isLoading ? (
        <div className="mt-2 h-8 w-32 bg-gray-200 rounded animate-pulse" />
      ) : error ? (
        <p className="mt-2 text-sm font-medium text-red-600">{error}</p>
      ) : (
        <p className="text-3xl font-bold text-gray-900 mt-1">
          {formatValue(value, format)}
        </p>
      )}
    </div>
  );
}
