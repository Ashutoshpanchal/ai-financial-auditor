/**
 * Full preset verification for debug session — writes NDJSON to .cursor/debug-77f6a0.log
 */
import { appendFileSync, writeFileSync } from "node:fs";
import {
  PICKER_PRESET_ORDER,
  applyPreset,
  clampRangeToScope,
  detectPreset,
  getPresetRange,
  type TransactionDateScope,
} from "../src/utils/dateRangePresets.ts";

const LOG_PATH =
  "/Users/ashutoshpanchal/Desktop/Project/AI-Finanical-Advisor/.cursor/debug-77f6a0.log";
const SESSION = "77f6a0";
const RUN_ID = "automated-full";

const SCOPE: TransactionDateScope = {
  min_date: "2024-03-01",
  max_date: "2026-04-15",
  months_with_data: ["2024-03", "2026-04"],
  has_transactions: true,
};

const TODAY = new Date(2026, 4, 18);

function log(
  hypothesisId: string,
  message: string,
  data: Record<string, unknown>,
): void {
  const entry = {
    sessionId: SESSION,
    runId: RUN_ID,
    hypothesisId,
    location: "verify-date-presets-debug.mts",
    message,
    data,
    timestamp: Date.now(),
  };
  appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`);
}

function isFullScope(from: string, to: string): boolean {
  return from === SCOPE.min_date && to === SCOPE.max_date;
}

writeFileSync(LOG_PATH, "");

log("H0", "verification started", { today: TODAY.toISOString(), scope: SCOPE });

let failures = 0;

for (const preset of PICKER_PRESET_ORDER) {
  const raw = getPresetRange(preset, TODAY);
  const applied = applyPreset(preset, SCOPE, TODAY);
  const detected = applied ? detectPreset(applied.from, applied.to, SCOPE, TODAY) : null;

  const validOrder = applied ? applied.from <= applied.to : false;
  const fullScopeBug = applied ? isFullScope(applied.from, applied.to) : false;
  const yesterdayOk =
    preset !== "yesterday" || !applied || applied.from === applied.to;
  const lastWeekOk =
    preset !== "last_week" ||
    !applied ||
    (!isFullScope(applied.from, applied.to) && applied.from !== applied.to);

  const ok = Boolean(applied) && validOrder && yesterdayOk && lastWeekOk;
  if (!ok) failures += 1;

  log("H1", `preset ${preset}`, {
    raw,
    applied,
    detected,
    validOrder,
    fullScopeBug,
    yesterdayOk,
    lastWeekOk,
    ok,
  });
}

const lastWeekClamp = clampRangeToScope("2026-05-11", "2026-05-17", SCOPE);
log("H2", "last_week clamp direct", {
  lastWeekClamp,
  expected: { from: "2026-04-09", to: "2026-04-15" },
  matchesExpected:
    lastWeekClamp.from === "2026-04-09" && lastWeekClamp.to === "2026-04-15",
});

log("H3", "summary", {
  presetCount: PICKER_PRESET_ORDER.length,
  failures,
  pass: failures === 0,
});

process.exit(failures === 0 ? 0 : 1);
