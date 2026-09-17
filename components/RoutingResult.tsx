"use client";

import { useState } from "react";
import ScoreBreakdown from "@/components/ScoreBreakdown";
import { buildRouterContext } from "@/lib/jevRouter";
import { NO_TOOL_NEEDED_ID } from "@/lib/routerConfigs";
import type { ResolvedRoute, RouteOption, RouterMode } from "@/types/router";

type Props = {
  mode: RouterMode;
  userInput: string;
  options: RouteOption[];
  result: ResolvedRoute;
  threshold: number;
};

export type Tone = "ok" | "warn" | "bad";

export function confidenceTone(confidence: number, threshold: number): Tone {
  if (confidence >= threshold) return "ok";
  if (confidence >= threshold - 0.15) return "warn";
  return "bad";
}

const TONE_TEXT: Record<Tone, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad" };
const TONE_STROKE: Record<Tone, string> = { ok: "var(--green)", warn: "var(--amber)", bad: "var(--red)" };

/**
 * The "execution" step, mocked. This is the ONLY place in the demo that knows
 * what an option id would mean at runtime, and all it does is print a line.
 * A real integration replaces this with an actual model call or tool call.
 */
export function describeExecution(mode: RouterMode, result: ResolvedRoute, userInput: string): string {
  const { action, effectiveOptionId, effectiveOption } = result;

  if (action.kind === "needs_clarification") {
    return `→ would ask the user: "${action.prompt}"`;
  }
  if (!effectiveOptionId) return "→ nothing to execute";

  if (mode === "tool") {
    if (effectiveOptionId === NO_TOOL_NEEDED_ID) return "→ would answer directly, no tool call";
    return `→ would call: ${effectiveOptionId}(${JSON.stringify(userInput)})`;
  }

  const cost = effectiveOption?.metadata?.cost_per_1k_tokens;
  const costNote = cost !== undefined ? `  # $${cost}/1k tokens` : "";
  return `→ would send request to: ${effectiveOptionId}${costNote}`;
}

/** Radial confidence meter. Static cue (number + colour) plus the arc. */
function ConfidenceRing({ value, threshold, tone }: { value: number; threshold: number; tone: Tone }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const dash = c * Math.min(1, Math.max(0, value));
  // The svg is rotated -90deg so the arc starts at 12 o'clock; in svg space the start is angle 0.
  const thresholdAngle = threshold * 2 * Math.PI;
  const tick = (radius: number) => [32 + radius * Math.cos(thresholdAngle), 32 + radius * Math.sin(thresholdAngle)] as const;
  const [x1, y1] = tick(r - 5);
  const [x2, y2] = tick(r + 5);
  return (
    <div className="relative h-16 w-16 shrink-0" role="img" aria-label={`Confidence ${value.toFixed(2)} of threshold ${threshold.toFixed(2)}`}>
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--panel-3)" strokeWidth="5" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          style={{ transition: "stroke-dasharray 320ms cubic-bezier(0.2,0,0,1), stroke 200ms ease" }}
        />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className={`tnum absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold ${TONE_TEXT[tone]}`}>{value.toFixed(2)}</span>
    </div>
  );
}

export default function RoutingResult({ mode, userInput, options, result, threshold }: Props) {
  const [showPrompt, setShowPrompt] = useState(false);
  const { decision, action, effectiveOption, source } = result;
  const labels = new Map(options.map((o) => [o.id, o.label]));
  const tone = confidenceTone(decision.confidence, threshold);
  const trusted = action.kind === "none";
  const jevPickLabel = decision.selectedOptionId ? (labels.get(decision.selectedOptionId) ?? decision.selectedOptionId) : "No valid pick";
  const reasonText = action.kind !== "none" && action.reason === "invalid_option" ? "Jev returned an id outside the option list" : "confidence below threshold";

  return (
    <div className="stagger space-y-5">
      {/* 1. Pick + confidence */}
      <div className="flex items-start gap-4">
        <ConfidenceRing value={decision.confidence} threshold={threshold} tone={tone} />
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{trusted ? "Selected" : "Jev's top pick · not trusted"}</div>
          <div className={`mt-0.5 truncate text-xl font-semibold tracking-tight ${trusted ? "text-ink" : "text-muted line-through decoration-bad/60 decoration-2"}`}>
            {jevPickLabel}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
            {decision.selectedOptionId && <code className="font-mono">{decision.selectedOptionId}</code>}
            <span>·</span>
            <span className="tnum">
              confidence <span className={TONE_TEXT[tone]}>{decision.confidence.toFixed(2)}</span> vs threshold {threshold.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Fallback status */}
      {trusted ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-ok/30 bg-ok/[0.06] px-3 py-2.5 text-sm text-ink-2">
          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-ok text-[10px] text-bg" aria-hidden>
            ✓
          </span>
          <span>
            <span className="font-medium text-ok">Pick stands.</span> Confidence met the threshold, so no fallback ran.
          </span>
        </div>
      ) : action.kind === "safe_default" ? (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2.5 text-sm text-ink-2">
          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn text-[10px] font-bold text-bg" aria-hidden>
            !
          </span>
          <span>
            <span className="font-medium text-warn">Fallback: safe default.</span> {reasonText[0].toUpperCase() + reasonText.slice(1)}, so the request goes to{" "}
            <span className="font-medium text-ink">{effectiveOption?.label ?? action.optionId}</span> instead.
          </span>
        </div>
      ) : (
        <div className="flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn/[0.06] px-3 py-2.5 text-sm text-ink-2">
          <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-warn text-[10px] font-bold text-bg" aria-hidden>
            ?
          </span>
          <span>
            <span className="font-medium text-warn">Fallback: ask the user.</span> {reasonText[0].toUpperCase() + reasonText.slice(1)}. No tool is called; the app asks a
            clarifying question instead of guessing.
          </span>
        </div>
      )}

      {/* 3. Execution line: the boundary. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Execution · your code, mocked</span>
          <span className="hidden text-[11px] text-muted sm:inline">Jev decided → code executes</span>
        </div>
        <pre className="overflow-x-auto rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-[13px] leading-relaxed text-teal">{describeExecution(mode, result, userInput)}</pre>
      </div>

      {/* 4. Scores */}
      <div>
        <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Score breakdown</div>
        <ScoreBreakdown scores={decision.allOptionScores} options={options} selectedId={decision.selectedOptionId} effectiveId={result.effectiveOptionId} threshold={threshold} />
      </div>

      {/* 5. What Jev saw */}
      <div className="border-t border-line pt-3">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors duration-150 hover:text-ink"
          onClick={() => setShowPrompt((s) => !s)}
          aria-expanded={showPrompt}
        >
          <span aria-hidden className="inline-block transition-transform duration-150" style={{ transform: showPrompt ? "rotate(90deg)" : "rotate(0deg)" }}>
            ▸
          </span>
          Context sent to {source === "jev" ? "Jev" : "the simulator"}
        </button>
        {showPrompt && (
          <pre className="enter mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-ink-2">
            {buildRouterContext({ userInput, options })}
          </pre>
        )}
      </div>
    </div>
  );
}
