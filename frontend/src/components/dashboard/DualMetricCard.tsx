interface DualMetricCardProps {
  title: string;
  spend: number;
  received: number;
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

export function DualMetricCard({
  title,
  spend,
  received,
  format,
  isLoading = false,
  error = null,
}: DualMetricCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <p className="text-sm font-semibold text-gray-900 mb-4">{title}</p>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-gray-200 rounded animate-pulse" />
          <div className="h-16 bg-gray-200 rounded animate-pulse" />
        </div>
      ) : error ? (
        <p className="text-sm font-medium text-red-600">{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Spend</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatValue(spend, format)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Received
            </p>
            <p className="text-2xl font-bold text-emerald-700 mt-1">
              {formatValue(received, format)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
