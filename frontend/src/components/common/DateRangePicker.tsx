import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  applyPreset,
  clampRangeToScope,
  detectPreset,
  formatDateRangeLabel,
  getPresetRange,
  normalizeScopeBound,
  PICKER_PRESET_ORDER,
  PRESET_LABELS,
  type DateRangePreset,
  type DateRangeValue,
  type TransactionDateScope,
} from "../../utils/dateRangePresets";
import {
  buildCalendarWeeks,
  compareIso,
  isIsoDateDisabled,
  parseIsoDate,
} from "../../utils/calendarGrid";

export interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue, preset?: DateRangePreset | null) => void;
  scope: TransactionDateScope | null;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  /** Accessible label for the trigger (e.g. "Date range"). */
  label?: string;
  /**
   * `confirm`: left rail / calendars edit a draft; **Apply** commits, **Cancel** discards.
   * `live`: every change calls `onChange` immediately (e.g. page-level draft + separate Apply).
   */
  applyMode?: "confirm" | "live";
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addCalendarMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function formatMonthYear(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function dayCellClasses(
  iso: string,
  draftFrom: string,
  draftTo: string,
  inCurrentMonth: boolean,
  disabled: boolean,
): string {
  const base =
    "relative flex h-9 w-9 items-center justify-center rounded-lg text-sm transition focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-1";
  if (disabled) {
    return `${base} cursor-not-allowed text-gray-300`;
  }
  if (!draftFrom || !draftTo) {
    return `${base} ${inCurrentMonth ? "text-gray-800 hover:bg-violet-50" : "text-gray-400 hover:bg-gray-50"}`;
  }
  if (compareIso(iso, draftFrom) < 0 || compareIso(iso, draftTo) > 0) {
    return `${base} ${inCurrentMonth ? "text-gray-800 hover:bg-violet-50" : "text-gray-400 hover:bg-gray-50"}`;
  }
  const isStart = iso === draftFrom;
  const isEnd = iso === draftTo;
  if (isStart && isEnd) {
    return `${base} bg-violet-600 font-semibold text-white shadow-sm`;
  }
  if (isStart) {
    return `${base} bg-violet-600 font-semibold text-white shadow-sm`;
  }
  if (isEnd) {
    return `${base} bg-violet-600 font-semibold text-white shadow-sm`;
  }
  return `${base} bg-violet-100 font-medium text-violet-900`;
}

interface MonthGridProps {
  year: number;
  monthIndex: number;
  draftFrom: string;
  draftTo: string;
  minBound?: string;
  maxBound?: string;
  onDayClick: (iso: string) => void;
}

function MonthGrid({
  year,
  monthIndex,
  draftFrom,
  draftTo,
  minBound,
  maxBound,
  onDayClick,
}: MonthGridProps) {
  const weeks = useMemo(() => buildCalendarWeeks(year, monthIndex), [year, monthIndex]);

  return (
    <div className="select-none">
      <div className="mb-1 grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {d}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-0.5">
        {weeks.map((row, wi) => (
          <div key={wi} className="grid grid-cols-7 place-items-center gap-0.5">
            {row.map((cell) => {
              const disabled = isIsoDateDisabled(cell.iso, minBound, maxBound);
              const cls = dayCellClasses(cell.iso, draftFrom, draftTo, cell.inCurrentMonth, disabled);
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => onDayClick(cell.iso)}
                  className={cls}
                >
                  {cell.date.getDate()}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Dual-month range picker with left preset rail, reference-style layout.
 */
export function DateRangePicker({
  value,
  onChange,
  scope,
  disabled = false,
  loading = false,
  className = "",
  label = "Date range",
  applyMode = "confirm",
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(value.from);
  const [draftTo, setDraftTo] = useState(value.to);
  const [viewStart, setViewStart] = useState(() => startOfMonth(new Date()));
  const [selectAnchor, setSelectAnchor] = useState<string | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef<DateRangeValue>({ from: "", to: "" });
  const wasOpenRef = useRef(false);

  const activeCommitted = detectPreset(value.from, value.to, scope);
  const activeDraft = detectPreset(draftFrom, draftTo, scope);
  const triggerLabel = loading
    ? "Loading dates…"
    : formatDateRangeLabel(value.from, value.to, activeCommitted);

  const minBound = normalizeScopeBound(scope?.min_date);
  const maxBound = normalizeScopeBound(scope?.max_date);
  const noData = scope && !scope.has_transactions;

  const leftYear = viewStart.getFullYear();
  const leftMonth = viewStart.getMonth();
  const rightStart = addCalendarMonths(viewStart, 1);
  const rightYear = rightStart.getFullYear();
  const rightMonth = rightStart.getMonth();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (applyMode === "confirm") {
          setDraftFrom(snapshotRef.current.from);
          setDraftTo(snapshotRef.current.to);
        }
        setOpen(false);
      }
    }
    function onOutsideClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        if (applyMode === "confirm") {
          setDraftFrom(snapshotRef.current.from);
          setDraftTo(snapshotRef.current.to);
        }
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    // Defer so the opening click does not immediately dismiss the panel.
    const attachId = window.setTimeout(() => {
      document.addEventListener("click", onOutsideClick);
    }, 0);
    return () => {
      window.clearTimeout(attachId);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onOutsideClick);
    };
  }, [open, applyMode]);

  useEffect(() => {
    if (open && !wasOpenRef.current) {
      snapshotRef.current = { from: value.from, to: value.to };
      setDraftFrom(value.from);
      setDraftTo(value.to);
      setSelectAnchor(null);
      const d = parseIsoDate(value.from) ?? new Date();
      setViewStart(startOfMonth(d));
    }
    wasOpenRef.current = open;
  }, [open, value.from, value.to]);

  useEffect(() => {
    if (!open) {
      setDraftFrom(value.from);
      setDraftTo(value.to);
    }
  }, [value.from, value.to, open]);

  function commitDraft(preset: DateRangePreset | null) {
    onChange({ from: draftFrom, to: draftTo }, preset ?? undefined);
  }

  function pushLive(next: DateRangeValue, preset: DateRangePreset | null) {
    setDraftFrom(next.from);
    setDraftTo(next.to);
    onChange(next, preset ?? undefined);
  }

  function handlePreset(preset: DateRangePreset) {
    const raw = getPresetRange(preset);
    const applied = applyPreset(preset, scope);
    // #region agent log
    fetch("http://127.0.0.1:7468/ingest/c6a2fb7b-a253-45f4-9e0e-b6181ccf071d", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "77f6a0" },
      body: JSON.stringify({
        sessionId: "77f6a0",
        runId: "browser",
        hypothesisId: "H4",
        location: "DateRangePicker.tsx:handlePreset",
        message: "preset applied in UI",
        data: {
          preset,
          raw,
          applied,
          applyMode,
          scopeMin: scope?.min_date ?? null,
          scopeMax: scope?.max_date ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!applied) return;
    const p = detectPreset(applied.from, applied.to, scope);
    setDraftFrom(applied.from);
    setDraftTo(applied.to);
    setSelectAnchor(null);
    setViewStart(startOfMonth(parseIsoDate(applied.from) ?? new Date()));
    snapshotRef.current = { from: applied.from, to: applied.to };
    // Quick presets always commit — users expect filters to update immediately.
    onChange(applied, p ?? undefined);
  }

  function handleDayClick(iso: string) {
    if (isIsoDateDisabled(iso, minBound, maxBound)) return;

    if (!selectAnchor) {
      setSelectAnchor(iso);
      const next = { from: iso, to: iso };
      setDraftFrom(iso);
      setDraftTo(iso);
      if (applyMode === "live") {
        onChange(next, null);
      }
      return;
    }

    const from = compareIso(selectAnchor, iso) <= 0 ? selectAnchor : iso;
    const to = compareIso(selectAnchor, iso) <= 0 ? iso : selectAnchor;
    const clamped = clampRangeToScope(from, to, scope);
    setSelectAnchor(null);
    setDraftFrom(clamped.from);
    setDraftTo(clamped.to);
    if (applyMode === "live") {
      const preset = detectPreset(clamped.from, clamped.to, scope);
      onChange(clamped, preset ?? undefined);
    }
  }

  function handleDraftDateChange(nextFrom: string, nextTo: string) {
    const clamped = clampRangeToScope(nextFrom, nextTo, scope);
    setDraftFrom(clamped.from);
    setDraftTo(clamped.to);
    setSelectAnchor(null);
    if (applyMode === "live") {
      const preset = detectPreset(clamped.from, clamped.to, scope);
      onChange(clamped, preset ?? undefined);
    }
  }

  function handleApply() {
    const preset = detectPreset(draftFrom, draftTo, scope);
    commitDraft(preset);
    setOpen(false);
  }

  function handleCancel() {
    setDraftFrom(snapshotRef.current.from);
    setDraftTo(snapshotRef.current.to);
    setOpen(false);
  }

  function handleClearTrigger(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    onChange({ from: "", to: "" }, null);
    setDraftFrom("");
    setDraftTo("");
    setSelectAnchor(null);
  }

  function shiftMonths(delta: number) {
    setViewStart((v) => addCalendarMonths(v, delta));
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <label htmlFor={`${panelId}-trigger`} className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </label>
      <div
        className={`mt-0.5 flex min-w-[12rem] items-stretch overflow-hidden rounded-xl border bg-white shadow-sm transition dark:bg-gray-800 ${
          open
            ? "border-violet-400 ring-2 ring-violet-100 dark:border-violet-500 dark:ring-violet-900/40"
            : "border-gray-200 hover:border-violet-200 hover:shadow dark:border-gray-700 dark:hover:border-violet-600"
        }`}
      >
        <button
          id={`${panelId}-trigger`}
          type="button"
          disabled={disabled || loading}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? panelId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setOpen((o) => !o);
          }}
          className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-gray-800 transition hover:bg-violet-50/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:text-gray-100 dark:hover:bg-violet-950/30"
        >
          <span className="truncate text-violet-950 dark:text-violet-100">{triggerLabel}</span>
          <svg
            className={`h-4 w-4 shrink-0 text-violet-400 transition ${open ? "rotate-180" : ""}`}
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
        {(value.from || value.to) && !loading && (
          <button
            type="button"
            aria-label="Clear dates"
            disabled={disabled}
            onClick={handleClearTrigger}
            className="border-l border-gray-100 px-2.5 text-lg leading-none text-gray-400 transition hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={label}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-0 top-full z-50 mt-2 w-[min(100vw-1rem,44rem)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900 dark:ring-white/10"
        >
          {noData ? (
            <p className="p-4 text-sm text-gray-500">
              No transactions yet. Upload a statement to filter by date.
            </p>
          ) : (
            <div className="flex max-h-[min(70vh,640px)] flex-col sm:max-h-[70vh] sm:flex-row">
              {/* Left rail */}
              <nav
                aria-label="Quick ranges"
                className="flex max-h-48 shrink-0 flex-row gap-1 overflow-x-auto border-b border-gray-100 bg-gray-50/80 p-2 dark:border-gray-800 dark:bg-gray-800/80 sm:max-h-none sm:w-44 sm:flex-col sm:gap-0.5 sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-2"
              >
                {PICKER_PRESET_ORDER.map((preset) => {
                  const canApply = applyPreset(preset, scope) !== null;
                  const isActive = activeDraft === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={!canApply}
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreset(preset);
                      }}
                      className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition sm:w-full ${
                        isActive
                          ? "border-l-4 border-violet-600 bg-violet-100 font-semibold text-violet-900 sm:border-l-4"
                          : canApply
                            ? "border-l-4 border-transparent text-gray-700 hover:bg-white hover:text-violet-800"
                            : "cursor-not-allowed text-gray-300"
                      }`}
                    >
                      {PRESET_LABELS[preset]}
                    </button>
                  );
                })}
              </nav>

              {/* Right: dual calendars + optional inputs + footer */}
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col gap-3 p-3 sm:flex-row sm:gap-4 sm:p-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-label="Previous months"
                        onClick={() => shiftMonths(-1)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                        </svg>
                      </button>
                      <span className="text-center text-sm font-semibold text-gray-900">
                        {formatMonthYear(leftYear, leftMonth)}
                      </span>
                      <span className="w-6 shrink-0" aria-hidden />
                    </div>
                    <MonthGrid
                      year={leftYear}
                      monthIndex={leftMonth}
                      draftFrom={draftFrom}
                      draftTo={draftTo}
                      minBound={minBound}
                      maxBound={maxBound}
                      onDayClick={handleDayClick}
                    />
                  </div>

                  <div className="hidden w-px shrink-0 bg-violet-100 sm:block" aria-hidden />

                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="w-6 shrink-0" aria-hidden />
                      <span className="text-center text-sm font-semibold text-gray-900">
                        {formatMonthYear(rightYear, rightMonth)}
                      </span>
                      <button
                        type="button"
                        aria-label="Next months"
                        onClick={() => shiftMonths(1)}
                        className="rounded-lg p-1.5 text-gray-500 hover:bg-violet-50 hover:text-violet-700"
                      >
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                    <MonthGrid
                      year={rightYear}
                      monthIndex={rightMonth}
                      draftFrom={draftFrom}
                      draftTo={draftTo}
                      minBound={minBound}
                      maxBound={maxBound}
                      onDayClick={handleDayClick}
                    />
                  </div>
                </div>

                <div className="border-t border-gray-100 px-4 py-2">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-gray-400">Exact dates</p>
                  <div className="grid grid-cols-2 gap-3 sm:max-w-md">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${panelId}-draft-from`} className="text-xs text-gray-500">
                        From
                      </label>
                      <input
                        id={`${panelId}-draft-from`}
                        type="date"
                        value={draftFrom}
                        min={minBound}
                        max={maxBound}
                        onChange={(e) => handleDraftDateChange(e.target.value, draftTo)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`${panelId}-draft-to`} className="text-xs text-gray-500">
                        To
                      </label>
                      <input
                        id={`${panelId}-draft-to`}
                        type="date"
                        value={draftTo}
                        min={minBound}
                        max={maxBound}
                        onChange={(e) => handleDraftDateChange(draftFrom, e.target.value)}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-300"
                      />
                    </div>
                  </div>
                </div>

                {applyMode === "confirm" && (
                  <div className="flex justify-end gap-2 border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                    <button
                      type="button"
                      onClick={handleCancel}
                      className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApply}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
                    >
                      Apply
                    </button>
                  </div>
                )}

                {applyMode === "live" && (
                  <div className="flex justify-end border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
                    >
                      Done
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
