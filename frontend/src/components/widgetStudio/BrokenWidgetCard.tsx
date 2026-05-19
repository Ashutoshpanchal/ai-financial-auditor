interface BrokenWidgetCardProps {
  title?: string;
  message: string;
}

// Grey warning card when a widget references a deleted category.
export function BrokenWidgetCard({ title, message }: BrokenWidgetCardProps) {
  return (
    <div
      className="rounded-2xl border border-gray-200 bg-gray-100 p-8 text-center min-h-[140px] flex flex-col items-center justify-center"
      data-testid="broken-widget-card"
    >
      {title ? (
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          {title}
        </p>
      ) : null}
      <p className="text-2xl mb-2 text-amber-600" aria-hidden>
        {"\u26A0"}
      </p>
      <p className="text-sm text-gray-700 max-w-sm">{message}</p>
    </div>
  );
}
