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
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>

      {isLoading ? (
        <div className="mt-2 h-8 w-32 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
      ) : error ? (
        <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
      ) : (
        <p className="mt-1 text-3xl font-bold text-gray-900 dark:text-white">
          {formatValue(value, format)}
        </p>
      )}
    </div>
  );
}
