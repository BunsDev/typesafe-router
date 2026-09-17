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

function LockIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

/**
 * Compact inline editor. Each option is one row; fields look like text until
 * hovered or focused, so the list reads as a table and edits as a form.
 */
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
    // Focus the new row's label on the next frame so the user can type straight away.
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLInputElement>("[data-option-label]");
      rows[rows.length - 1]?.focus();
      rows[rows.length - 1]?.select();
    });
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <div className="min-w-[36rem]">
          <div className="grid grid-cols-[9.5rem_11rem_minmax(0,1fr)_2rem] items-center gap-1 px-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span className="px-1.5">id</span>
            <span className="px-1.5">label</span>
            <span className="truncate px-1.5">description · read by Jev</span>
            <span />
          </div>

          <ul className="divide-y divide-line rounded-lg border border-line bg-panel">
            {options.map((option, index) => {
              const isRequired = option.id === requiredId;
              const isDuplicate = duplicateIds.has(option.id);
              const isEmpty = option.id.trim().length === 0;
              const idInvalid = isDuplicate || isEmpty;
              return (
                <li
                  key={index}
                  className={`grid grid-cols-[9.5rem_11rem_minmax(0,1fr)_2rem] items-center gap-1 px-1.5 py-1 ${isRequired ? "bg-teal/[0.05]" : ""}`}
                >
                  <div className="min-w-0">
                    <input
                      className={`field-inline font-mono text-[13px] ${idInvalid ? "!border-bad" : ""} ${isRequired ? "text-teal" : ""}`}
                      value={option.id}
                      disabled={disabled || isRequired}
                      spellCheck={false}
                      onChange={(e) => update(index, { id: slugify(e.target.value) || e.target.value.toLowerCase() })}
                      aria-invalid={idInvalid}
                      aria-label={`Option ${index + 1} id`}
                      title={isRequired ? "Required by the fallback policy. The id is fixed." : undefined}
                    />
                  </div>
                  <input
                    className="field-inline"
                    value={option.label}
                    disabled={disabled}
                    data-option-label
                    aria-label={`Option ${index + 1} label`}
                    onChange={(e) => {
                      const patch: Partial<RouteOption> = { label: e.target.value };
                      if (!isRequired && (option.id === slugify(option.label) || option.id.startsWith("new_option"))) {
                        patch.id = slugify(e.target.value) || option.id;
                      }
                      update(index, patch);
                    }}
                  />
                  <input
                    className="field-inline text-ink-2"
                    value={option.description}
                    disabled={disabled}
                    aria-label={`Option ${index + 1} description`}
                    onChange={(e) => update(index, { description: e.target.value })}
                  />
                  {isRequired ? (
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center text-teal"
                      title="Required fallback option. The router throws if this id is missing."
                      aria-label="Required fallback option"
                    >
                      <LockIcon />
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost h-7 w-7 px-0 text-muted hover:!text-bad"
                      onClick={() => remove(index)}
                      disabled={disabled}
                      aria-label={`Remove ${option.label}`}
                      title="Remove option"
                    >
                      <CloseIcon />
                    </button>
                  )}
                  {isDuplicate && <p className="col-span-4 px-1.5 pb-1 text-[11px] text-bad">Duplicate id. Every option needs a unique id.</p>}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <button type="button" className="btn" onClick={add} disabled={disabled}>
          <span aria-hidden className="text-base leading-none">+</span> Add option
        </button>
        <div className="flex items-center gap-3">
          <span className="hidden text-[11px] text-muted sm:inline">
            <span className="inline-flex items-center gap-1 text-teal">
              <LockIcon /> required fallback
            </span>
          </span>
          <button type="button" className="btn btn-ghost text-muted" onClick={onReset} disabled={disabled}>
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
