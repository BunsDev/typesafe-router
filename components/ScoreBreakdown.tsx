"use client";

import type { RouteOption } from "@/types/router";

type Props = {
  scores: Record<string, number>;
  options: RouteOption[];
  selectedId: string;
  effectiveId: string | null;
  threshold: number;
};

export default function ScoreBreakdown({ scores, options, selectedId, effectiveId, threshold }: Props) {
  const labels = new Map(options.map((o) => [o.id, o.label]));
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const thresholdPct = Math.round(threshold * 100);

  return (
    <div>
      <ol className="space-y-2">
        {rows.map(([id, score]) => {
          const isSelected = id === selectedId;
          const isEffective = id === effectiveId;
          const pct = Math.round(score * 100);
          const fill = isSelected ? "bg-pink" : isEffective ? "bg-teal" : "bg-line-strong";
          return (
            <li key={id} className="grid grid-cols-[minmax(0,7.5rem)_1fr_2.75rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,11rem)_1fr_2.75rem]">
              <span className="flex min-w-0 items-center gap-1.5" title={id}>
                <span className={`truncate ${isSelected ? "font-medium text-ink" : "text-ink-2"}`}>{labels.get(id) ?? id}</span>
                {isEffective && !isSelected && (
                  <span className="shrink-0 rounded-full bg-teal/15 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-teal">fallback</span>
                )}
              </span>
              <div className="relative h-2 overflow-hidden rounded-full bg-panel-3">
                <div className={`bar-fill h-full rounded-full ${fill}`} style={{ width: `${Math.max(pct, 1)}%` }} />
                <div className="absolute inset-y-0 w-px bg-ink/50" style={{ left: `${thresholdPct}%` }} aria-hidden />
              </div>
              <span className="tnum text-right font-mono text-xs text-ink-2">{score.toFixed(2)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 text-[11px] text-muted">
        Per-option probabilities from {"Jev"}. Marker = threshold {threshold.toFixed(2)}.
      </p>
    </div>
  );
}
