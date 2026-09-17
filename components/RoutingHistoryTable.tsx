"use client";

import { confidenceTone } from "@/components/RoutingResult";
import type { RoutingLogEntry } from "@/types/router";

const TONE_TEXT = { ok: "text-ok", warn: "text-warn", bad: "text-bad" } as const;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function RoutingHistoryTable({ entries, onClear }: { entries: RoutingLogEntry[]; onClear: () => void }) {
  if (entries.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted">No routing decisions yet. Every run is logged here: input, options, pick, confidence, fallback.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-2 font-medium">Time</th>
              <th className="px-3 py-2 font-medium">Mode</th>
              <th className="px-3 py-2 font-medium">Input</th>
              <th className="px-3 py-2 font-medium">Jev pick</th>
              <th className="px-3 py-2 font-medium">Executed as</th>
              <th className="px-3 py-2 font-medium text-right">Conf.</th>
              <th className="px-3 py-2 font-medium">Fallback</th>
              <th className="px-3 py-2 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b border-line/60 align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted">{formatTime(e.timestamp)}</td>
                <td className="px-3 py-2 text-xs">{e.mode}</td>
                <td className="max-w-[18rem] truncate px-3 py-2 text-ink-2" title={e.userInput}>
                  {e.userInput}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.selectedOptionId || <span className="text-bad">invalid</span>}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {e.effectiveOptionId ?? <span className="text-warn">ask user</span>}
                </td>
                <td className={`px-3 py-2 text-right font-mono text-xs ${TONE_TEXT[confidenceTone(e.confidence, e.confidenceThreshold)]}`}>
                  {e.confidence.toFixed(2)}
                  <span className="text-muted"> / {e.confidenceThreshold.toFixed(2)}</span>
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.fallbackUsed ? <span className="text-warn">{e.fallbackAction.kind}</span> : <span className="text-muted">—</span>}
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
        <span>{entries.length} decision{entries.length === 1 ? "" : "s"} · newest first · also written to the server log</span>
        <button type="button" className="hover:text-ink" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
