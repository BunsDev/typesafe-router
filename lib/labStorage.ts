/**
 * Per-browser persistence for the demo lab: edited options, threshold, and
 * the routing history. Pure convenience so a refresh doesn't lose your work.
 *
 * Nothing sensitive lives here. The API key has its own storage
 * (`lib/apiKeyStorage.ts`) and is never mixed into this blob.
 */

import type { RouteOption, RouterMode, RoutingLogEntry } from "@/types/router";

export const LAB_STORAGE_KEY = "jev-router:lab";
export const LAB_STORAGE_VERSION = 1;
const MAX_HISTORY = 200;

export type LabState = {
  version: typeof LAB_STORAGE_VERSION;
  optionsByMode: Record<RouterMode, RouteOption[]>;
  threshold: number;
  history: RoutingLogEntry[];
};

function isOption(value: unknown): value is RouteOption {
  if (!value || typeof value !== "object") return false;
  const o = value as Partial<RouteOption>;
  return typeof o.id === "string" && typeof o.label === "string" && typeof o.description === "string";
}

function isLogEntry(value: unknown): value is RoutingLogEntry {
  if (!value || typeof value !== "object") return false;
  const e = value as Partial<RoutingLogEntry>;
  return (
    typeof e.id === "string" &&
    typeof e.timestamp === "string" &&
    (e.mode === "model" || e.mode === "tool") &&
    typeof e.userInput === "string" &&
    typeof e.confidence === "number" &&
    typeof e.confidenceThreshold === "number" &&
    typeof e.fallbackUsed === "boolean" &&
    !!e.fallbackAction &&
    typeof e.fallbackAction === "object"
  );
}

/** Validate an unknown blob into a LabState, or null if it's unusable. Partial blobs are tolerated. */
export function parseLabState(raw: unknown): Partial<LabState> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<LabState>;
  if (r.version !== LAB_STORAGE_VERSION) return null;
  const out: Partial<LabState> = { version: LAB_STORAGE_VERSION };

  if (r.optionsByMode && typeof r.optionsByMode === "object") {
    const model = Array.isArray(r.optionsByMode.model) ? r.optionsByMode.model.filter(isOption) : null;
    const tool = Array.isArray(r.optionsByMode.tool) ? r.optionsByMode.tool.filter(isOption) : null;
    if (model && tool) out.optionsByMode = { model, tool };
  }
  if (typeof r.threshold === "number" && r.threshold >= 0 && r.threshold <= 1) out.threshold = r.threshold;
  if (Array.isArray(r.history)) out.history = r.history.filter(isLogEntry).slice(0, MAX_HISTORY);
  return out;
}

export function loadLabState(): Partial<LabState> | null {
  try {
    if (typeof window === "undefined") return null;
    const text = window.localStorage.getItem(LAB_STORAGE_KEY);
    if (!text) return null;
    return parseLabState(JSON.parse(text));
  } catch {
    return null;
  }
}

export function saveLabState(state: Omit<LabState, "version">): boolean {
  try {
    if (typeof window === "undefined") return false;
    const payload: LabState = { version: LAB_STORAGE_VERSION, ...state, history: state.history.slice(0, MAX_HISTORY) };
    window.localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function clearLabState(): void {
  try {
    window.localStorage.removeItem(LAB_STORAGE_KEY);
  } catch {
    // nothing to do
  }
}

/** Serialize the log for download. Pretty-printed so it's readable in a diff or a spreadsheet import. */
export function historyToJson(history: RoutingLogEntry[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: history.length, decisions: history }, null, 2);
}
