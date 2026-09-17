"use client";

import { confidenceTone } from "@/components/RoutingResult";
import type { RoutingLogEntry } from "@/types/router";

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type Props = {
  entries: RoutingLogEntry[];
  onClear: () => void;
  onExport: () => void;
  /** Load an entry's mode, input and context back into the request panel. */
  onRecall: (entry: RoutingLogEntry) => void;
};

export default function RoutingHistoryTable({ entries, onClear, onExport, onRecall }: Props) {
  if (entries.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted">
        Nothing routed yet. Each run is logged here with its input, pick, confidence, and whether a fallback ran.
      </p>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-semibold">Time</th>
              <th className="px-3 py-2 font-semibold">Mode</th>
              <th className="px-3 py-2 font-semibold">Input</th>
              <th className="px-3 py-2 font-semibold">Jev pick</th>
              <th className="px-3 py-2 font-semibold">Executed as</th>
              <th className="px-3 py-2 text-right font-semibold">Conf.</th>
              <th className="px-3 py-2 font-semibold">Fallback</th>
              <th className="px-3 py-2 font-semibold">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr
                key={e.id}
                className="enter cursor-pointer border-b border-line/60 align-top transition-colors duration-100 hover:bg-panel-2 focus-within:bg-panel-2"
                onClick={() => onRecall(e)}
                title="Click to load this request"
              >
                <td className="tnum whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{formatTime(e.timestamp)}</td>
                <td className="px-3 py-2 text-xs text-ink-2">{e.mode}</td>
                <td className="max-w-[20rem] px-3 py-2">
                  {/* The button makes the row focusable and keyboard-operable. Enter/Space on it dispatches a
                      bubbling click, so the row's single onClick handles mouse and keyboard alike. */}
                  <button type="button" className="block w-full truncate rounded-sm text-left text-ink-2 underline-offset-2 hover:underline">
                    <span className="sr-only">Load this request: </span>
                    {e.userInput}
                  </button>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.selectedOptionId || <span className="text-bad">invalid</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.effectiveOptionId ?? <span className="text-warn">ask user</span>}</td>
                <td className={`tnum px-3 py-2 text-right font-mono text-xs ${TONE_TEXT[confidenceTone(e.confidence, e.confidenceThreshold)]}`}>
                  {e.confidence.toFixed(2)}
                  <span className="text-muted"> / {e.confidenceThreshold.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.fallbackUsed ? (
                    <span className="rounded-full bg-warn/15 px-1.5 py-px font-medium text-warn">{e.fallbackAction.kind.replace("_", " ")}</span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className={e.source === "jev" ? "text-teal" : "text-muted"}>{e.source === "jev" ? "Jev" : "simulated"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs text-muted">
        <span>
          {entries.length} decision{entries.length === 1 ? "" : "s"} · newest first · select a request to load it again
        </span>
        <span className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={onExport}>
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost h-7 px-2 text-xs" onClick={onClear}>
            Clear
          </button>
        </span>
      </div>
    </div>
  );
}
