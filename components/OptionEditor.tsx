"use client";

import type { RouteOption } from "@/types/router";

type Props = {
  options: RouteOption[];
  /** The option id the fallback policy requires. Its row can be edited but not removed. */
  requiredId: string;
  onChange: (options: RouteOption[]) => void;
  onReset: () => void;
  disabled?: boolean;
};

function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export default function OptionEditor({ options, requiredId, onChange, onReset, disabled }: Props) {
  const ids = options.map((o) => o.id);
  const duplicateIds = new Set(ids.filter((id, i) => ids.indexOf(id) !== i));

  function update(index: number, patch: Partial<RouteOption>) {
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }

  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }

  function add() {
    const base = "new_option";
    let id = base;
    let n = 2;
    while (ids.includes(id)) id = `${base}_${n++}`;
    onChange([...options, { id, label: "New option", description: "Describe when this option is the right choice." }]);
  }

  return (
    <div className="space-y-2">
      {options.map((option, index) => {
        const isRequired = option.id === requiredId;
        const isDuplicate = duplicateIds.has(option.id);
        const isEmpty = option.id.trim().length === 0;
        return (
          <div key={index} className={`rounded-md border p-2.5 ${isRequired ? "border-teal/50 bg-teal/5" : "border-line bg-panel-2/40"}`}>
            <div className="flex items-start gap-2">
              <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)]">
                <label className="block">
                  <span className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">id</span>
                  <input
                    className={`field font-mono ${isDuplicate || isEmpty ? "border-bad" : ""}`}
                    value={option.id}
                    disabled={disabled || isRequired}
                    spellCheck={false}
                    onChange={(e) => update(index, { id: slugify(e.target.value) || e.target.value.toLowerCase() })}
                    aria-invalid={isDuplicate || isEmpty}
                  />
                </label>
                <label className="block">
                  <span className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">label</span>
                  <input
                    className="field"
                    value={option.label}
                    disabled={disabled}
                    onChange={(e) => {
                      const patch: Partial<RouteOption> = { label: e.target.value };
                      // Keep the id in sync with the label while it still looks auto-generated.
                      if (!isRequired && (option.id === slugify(option.label) || option.id.startsWith("new_option"))) {
                        patch.id = slugify(e.target.value) || option.id;
                      }
                      update(index, patch);
                    }}
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-0.5 block text-[11px] uppercase tracking-wide text-muted">description (what Jev reads)</span>
                  <input
                    className="field"
                    value={option.description}
                    disabled={disabled}
                    onChange={(e) => update(index, { description: e.target.value })}
                  />
                </label>
              </div>
              <button
                type="button"
                className="btn mt-4 px-2 text-muted hover:text-bad"
                onClick={() => remove(index)}
                disabled={disabled || isRequired}
                title={isRequired ? "Required by the fallback policy. The router refuses option lists without it." : "Remove option"}
                aria-label={`Remove ${option.label}`}
              >
                ✕
              </button>
            </div>
            {isRequired && (
              <p className="mt-1.5 text-[11px] text-teal">
                Required fallback option. The router throws if this id is missing from the list.
              </p>
            )}
            {isDuplicate && <p className="mt-1.5 text-[11px] text-bad">Duplicate id. Every option needs a unique id.</p>}
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-1">
        <button type="button" className="btn" onClick={add} disabled={disabled}>
          + Add option
        </button>
        <button type="button" className="btn text-muted" onClick={onReset} disabled={disabled}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
