"use client";

import type { RouterMode } from "@/types/router";

const MODES: { value: RouterMode; label: string; hint: string }[] = [
  { value: "model", label: "Model Router", hint: "Which LLM should handle this?" },
  { value: "tool", label: "Tool Router", hint: "Which tool, if any, is relevant?" },
];

export default function ModeToggle({ mode, onChange, disabled }: { mode: RouterMode; onChange: (mode: RouterMode) => void; disabled?: boolean }) {
  const index = MODES.findIndex((m) => m.value === mode);
  return (
    <div role="radiogroup" aria-label="Router mode" className="segmented" data-index={index}>
      <span className="segmented-thumb" aria-hidden />
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={m.value === mode}
          disabled={disabled}
          onClick={() => onChange(m.value)}
          title={m.hint}
          className="segmented-option"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
