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

export function confidenceTone(confidence: number, threshold: number): "ok" | "warn" | "bad" {
  if (confidence >= threshold) return "ok";
  if (confidence >= threshold - 0.15) return "warn";
  return "bad";
}

const TONE_CLASSES = {
  ok: "border-ok/50 bg-ok/10 text-ok",
  warn: "border-warn/50 bg-warn/10 text-warn",
  bad: "border-bad/50 bg-bad/10 text-bad",
} as const;

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

export default function RoutingResult({ mode, userInput, options, result, threshold }: Props) {
  const [showPrompt, setShowPrompt] = useState(false);
  const { decision, action, effectiveOption, source } = result;
  const labels = new Map(options.map((o) => [o.id, o.label]));
  const tone = confidenceTone(decision.confidence, threshold);
  const jevPickLabel = decision.selectedOptionId ? (labels.get(decision.selectedOptionId) ?? decision.selectedOptionId) : "(no valid pick)";

  return (
    <div className="space-y-4">
      {/* Selection + confidence */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted">{action.kind === "none" ? "Selected option" : "Jev's top pick (not trusted)"}</div>
          <div className={`text-xl font-semibold ${action.kind === "none" ? "text-ink" : "text-muted line-through decoration-bad/70"}`}>{jevPickLabel}</div>
          {decision.selectedOptionId && <div className="font-mono text-xs text-muted">{decision.selectedOptionId}</div>}
        </div>
        <div className={`rounded-md border px-3 py-1.5 text-right ${TONE_CLASSES[tone]}`}>
          <div className="text-[11px] uppercase tracking-wider opacity-80">confidence</div>
          <div className="font-mono text-lg font-semibold leading-tight">{decision.confidence.toFixed(2)}</div>
          <div className="text-[11px] opacity-80">threshold {threshold.toFixed(2)}</div>
        </div>
      </div>

      {/* Fallback status */}
      {action.kind === "none" ? (
        <div className="rounded-md border border-ok/40 bg-ok/5 px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold text-ok">No fallback.</span> Confidence met the threshold, so the pick stands.
        </div>
      ) : action.kind === "safe_default" ? (
        <div className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold text-warn">Fallback triggered</span>{" "}
          ({action.reason === "invalid_option" ? "Jev returned an id outside the option list" : "confidence below threshold"}).{" "}
          Routing to the safe default instead: <span className="font-semibold text-ink">{effectiveOption?.label ?? action.optionId}</span>.
        </div>
      ) : (
        <div className="rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold text-warn">Fallback triggered</span>{" "}
          ({action.reason === "invalid_option" ? "Jev returned an id outside the option list" : "confidence below threshold"}).{" "}
          No tool will be called. The app should ask the user for clarification instead of guessing.
        </div>
      )}

      {/* Execution line: the boundary. The library returned an id; this is where YOUR code takes over. */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted">Execution (mocked, app code)</span>
          <span className="text-[11px] text-muted">Jev decided · your code executes</span>
        </div>
        <pre className="overflow-x-auto rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-teal">{describeExecution(mode, result, userInput)}</pre>
      </div>

      {/* Scores */}
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted">Score breakdown</div>
        <ScoreBreakdown scores={decision.allOptionScores} options={options} selectedId={decision.selectedOptionId} effectiveId={result.effectiveOptionId} threshold={threshold} />
      </div>

      {/* What Jev saw */}
      <div className="border-t border-line pt-3">
        <button type="button" className="text-xs text-muted underline-offset-2 hover:text-ink hover:underline" onClick={() => setShowPrompt((s) => !s)}>
          {showPrompt ? "Hide" : "Show"} the exact context sent to {source === "jev" ? "Jev" : "the simulator"}
        </button>
        {showPrompt && (
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg px-3 py-2 font-mono text-xs text-ink-2">
            {buildRouterContext({ userInput, options })}
          </pre>
        )}
      </div>
    </div>
  );
}
