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

  return (
    <div>
      <ol className="space-y-2">
        {rows.map(([id, score]) => {
          const isSelected = id === selectedId;
          const isEffective = id === effectiveId;
          const pct = Math.round(score * 100);
          return (
            <li key={id} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
              <span className="truncate" title={id}>
                <span className={isSelected ? "font-semibold text-ink" : "text-ink-2"}>{labels.get(id) ?? id}</span>
                {isEffective && !isSelected && <span className="ml-1 text-[10px] uppercase tracking-wide text-teal">fallback</span>}
              </span>
              <div className="relative h-3 overflow-hidden rounded-sm bg-panel-2">
                <div
                  className={`h-full transition-[width] ${isSelected ? "bg-pink" : isEffective ? "bg-teal" : "bg-line-strong"}`}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                />
                <div
                  className="absolute inset-y-0 w-px bg-ink/60"
                  style={{ left: `${Math.round(threshold * 100)}%` }}
                  title={`threshold ${threshold.toFixed(2)}`}
                  aria-hidden
                />
              </div>
              <span className="text-right font-mono text-xs text-ink-2">{score.toFixed(2)}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[11px] text-muted">
        Bars are Jev&apos;s per-option probabilities. The thin vertical line is the confidence threshold ({threshold.toFixed(2)}).
      </p>
    </div>
  );
}
