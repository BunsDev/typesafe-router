"use client";

import type { RouterMode } from "@/types/router";

const MODES: { value: RouterMode; label: string; hint: string }[] = [
  { value: "model", label: "Model Router", hint: "Which LLM should handle this?" },
  { value: "tool", label: "Tool Router", hint: "Which tool, if any, is relevant?" },
];

export default function ModeToggle({ mode, onChange, disabled }: { mode: RouterMode; onChange: (mode: RouterMode) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Router mode" className="inline-flex rounded-md border border-line bg-panel-2 p-0.5">
      {MODES.map((m) => {
        const active = m.value === mode;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(m.value)}
            title={m.hint}
            className={`rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
              active ? "bg-ink text-bg" : "text-ink-2 hover:text-ink"
            }`}
          >
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
