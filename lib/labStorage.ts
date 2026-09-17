/**
 * Per-browser persistence for the demo lab: edited options, threshold, and
 * the routing history. Pure convenience so a refresh doesn't lose your work.
 *
 * Nothing sensitive lives here. The API key has its own storage
 * (`lib/apiKeyStorage.ts`) and is never mixed into this blob.
 *
 * Everything read back is validated field by field. Storage can be edited by
 * hand or left behind by an older build, and a half-formed history entry must
 * be dropped rather than crash the lab while rendering.
 */

import type { FallbackAction, FallbackReason, RouteOption, RouterMode, RoutingLogEntry } from "@/types/router";

export const LAB_STORAGE_KEY = "jev-router:lab";
export const LAB_STORAGE_VERSION = 1;
export const MAX_HISTORY = 200;

export type LabState = {
  version: typeof LAB_STORAGE_VERSION;
  optionsByMode: Record<RouterMode, RouteOption[]>;
  threshold: number;
  history: RoutingLogEntry[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((s) => typeof s === "string");
}

function isMetadata(value: unknown): value is RouteOption["metadata"] {
  return value === undefined || (isRecord(value) && Object.values(value).every((v) => typeof v === "string" || typeof v === "number"));
}

function isOption(value: unknown): value is RouteOption {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && typeof value.label === "string" && typeof value.description === "string" && isMetadata(value.metadata);
}

function isScoreMap(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every(isFiniteNumber);
}

function isReason(value: unknown): value is FallbackReason {
  return value === "low_confidence" || value === "invalid_option";
}

/** The discriminated union has to be checked per variant; `{}` is not a FallbackAction. */
export function isFallbackAction(value: unknown): value is FallbackAction {
  if (!isRecord(value)) return false;
  switch (value.kind) {
    case "none":
      return true;
    case "safe_default":
      return typeof value.optionId === "string" && isReason(value.reason);
    case "needs_clarification":
      return typeof value.prompt === "string" && isReason(value.reason);
    default:
      return false;
  }
}

export function isLogEntry(value: unknown): value is RoutingLogEntry {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.timestamp === "string" &&
    (value.mode === "model" || value.mode === "tool") &&
    typeof value.userInput === "string" &&
    (value.context === undefined || typeof value.context === "string") &&
    isStringArray(value.optionsConsidered) &&
    typeof value.selectedOptionId === "string" &&
    (value.effectiveOptionId === null || typeof value.effectiveOptionId === "string") &&
    isFiniteNumber(value.confidence) &&
    isFiniteNumber(value.confidenceThreshold) &&
    isScoreMap(value.allOptionScores) &&
    typeof value.fallbackUsed === "boolean" &&
    isFallbackAction(value.fallbackAction) &&
    (value.source === "jev" || value.source === "mock") &&
    isFiniteNumber(value.durationMs)
  );
}

/** Validate an unknown blob into a LabState, or null if it's unusable. Partial blobs are tolerated. */
export function parseLabState(raw: unknown): Partial<LabState> | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== LAB_STORAGE_VERSION) return null;
  const out: Partial<LabState> = { version: LAB_STORAGE_VERSION };

  if (isRecord(raw.optionsByMode)) {
    const model = Array.isArray(raw.optionsByMode.model) ? raw.optionsByMode.model.filter(isOption) : null;
    const tool = Array.isArray(raw.optionsByMode.tool) ? raw.optionsByMode.tool.filter(isOption) : null;
    if (model && tool) out.optionsByMode = { model, tool };
  }
  if (isFiniteNumber(raw.threshold) && raw.threshold >= 0 && raw.threshold <= 1) out.threshold = raw.threshold;
  if (Array.isArray(raw.history)) out.history = raw.history.filter(isLogEntry).slice(0, MAX_HISTORY);
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
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LAB_STORAGE_KEY);
  } catch {
    // nothing to do
  }
}

/** Serialize the log for download. Pretty-printed so it's readable in a diff or a spreadsheet import. */
export function historyToJson(history: RoutingLogEntry[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: history.length, decisions: history }, null, 2);
}
