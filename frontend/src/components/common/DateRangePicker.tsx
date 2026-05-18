import { useEffect, useId, useRef, useState } from "react";
import {
  applyPreset,
  clampRangeToScope,
  DATE_RANGE_PRESETS,
  detectPreset,
  formatDateRangeLabel,
  PRESET_LABELS,
  type DateRangePreset,
  type DateRangeValue,
  type TransactionDateScope,
} from "../../utils/dateRangePresets";

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue, preset: DateRangePreset | null) => void;
  scope: TransactionDateScope | null;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Accessible label for the trigger (e.g. "Date range"). */
  label?: string;
}

/**
 * Popover date-range picker with calendar presets and optional custom range.
 */
export function DateRangePicker({
  value,
  onChange,
  scope,
  disabled = false,
  loading = false,
  className = "",
  label = "Date range",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const activePreset = detectPreset(value.from, value.to, scope);
  const triggerLabel = loading
    ? "Loading dates…"
    : formatDateRangeLabel(value.from, value.to, activePreset);

  const minBound = scope?.min_date ?? undefined;
  const maxBound = scope?.max_date ?? undefined;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  function selectPreset(preset: DateRangePreset) {
    const applied = applyPreset(preset, scope);
    if (!applied) return;
    onChange(applied, preset);
    setOpen(false);
    setCustomOpen(false);
  }

  function handleCustomFrom(nextFrom: string) {
    const clamped = clampRangeToScope(nextFrom, value.to || nextFrom, scope);
    onChange(clamped, null);
  }

  function handleCustomTo(nextTo: string) {
    const clamped = clampRangeToScope(value.from || nextTo, nextTo, scope);
    onChange(clamped, null);
  }

  const noData = scope && !scope.has_transactions;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <label htmlFor={`${panelId}-trigger`} className="text-xs font-medium text-gray-500">
        {label}
      </label>
      <button
        id={`${panelId}-trigger`}
        type="button"
        disabled={disabled || loading}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
        className="mt-0.5 flex min-w-[10rem] items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-800 transition hover:bg-white focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          className="absolute left-0 top-full z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-3 shadow-lg"
        >
          {noData ? (
            <p className="text-sm text-gray-500">
              No transactions yet. Upload a statement to filter by date.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {DATE_RANGE_PRESETS.map((preset) => {
                  const canApply = applyPreset(preset, scope) !== null;
                  const isActive = activePreset === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={!canApply}
                      onClick={() => selectPreset(preset)}
                      className={`rounded-lg px-2 py-1.5 text-left text-xs font-medium transition ${
                        isActive
                          ? "bg-indigo-600 text-white"
                          : canApply
                            ? "text-gray-700 hover:bg-indigo-50 hover:text-indigo-700"
                            : "cursor-not-allowed text-gray-300"
                      }`}
                    >
                      {PRESET_LABELS[preset]}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 border-t border-gray-100 pt-2">
                <button
                  type="button"
                  onClick={() => setCustomOpen((v) => !v)}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                >
                  {customOpen ? "Hide custom range" : "Custom range"}
                </button>
                {customOpen && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-0.5">
                      <label htmlFor={`${panelId}-custom-from`} className="text-xs text-gray-500">
                        From
                      </label>
                      <input
                        id={`${panelId}-custom-from`}
                        type="date"
                        value={value.from}
                        min={minBound}
                        max={maxBound}
                        onChange={(e) => handleCustomFrom(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <label htmlFor={`${panelId}-custom-to`} className="text-xs text-gray-500">
                        To
                      </label>
                      <input
                        id={`${panelId}-custom-to`}
                        type="date"
                        value={value.to}
                        min={minBound}
                        max={maxBound}
                        onChange={(e) => handleCustomTo(e.target.value)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
