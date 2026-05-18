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
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{title}</p>
      {isLoading ? (
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
          <div className="h-16 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ) : error ? (
        <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Spend
            </p>
            <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
              {formatValue(spend, format)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Received
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
              {formatValue(received, format)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
