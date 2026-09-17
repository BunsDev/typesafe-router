"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { clearApiKey, hasStoredApiKey, saveApiKey, subscribeApiKey } from "@/lib/apiKeyStorage";

/** True when a key is saved in this browser. Server-rendered as false, so there is no hydration mismatch. */
export function useHasStoredApiKey(): boolean {
  return useSyncExternalStore(subscribeApiKey, hasStoredApiKey, () => false);
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Whether the server has its own TYPESAFE_API_KEY. */
  serverHasKey: boolean;
};

/**
 * Bring-your-own-key dialog.
 *
 * Designed to be safe on a livestream or screen-share:
 *   - The input is `type="password"`, so what's typed is masked.
 *   - The draft is wiped from component state the moment it is saved.
 *   - The saved key is never read back into the UI. The only thing rendered
 *     is a yes/no "a key is saved in this browser" status. No last-four, no
 *     length, no reveal button.
 */
export default function ApiKeyPanel({ open, onClose, serverHasKey }: Props) {
  const hasKey = useHasStoredApiKey();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  // Sync the native <dialog> with the `open` prop.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  function save() {
    if (!draft.trim()) return;
    const ok = saveApiKey(draft);
    setDraft(""); // never keep the key in state longer than needed
    if (!ok) {
      setNotice({ tone: "bad", text: "Couldn't save: this browser blocks local storage." });
      return;
    }
    setNotice({ tone: "ok", text: "Saved. Routing will use your key from now on." });
  }

  function clear() {
    clearApiKey();
    setDraft("");
    setNotice({ tone: "ok", text: "Removed from this browser." });
  }

  function close() {
    setDraft("");
    setNotice(null);
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      onClose={close}
      onClick={(e) => {
        if (e.target === dialogRef.current) close(); // backdrop click
      }}
      aria-labelledby="api-key-title"
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="api-key-title" className="text-base font-semibold tracking-tight">
              Use your own TypeSafe key
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Saved in this browser only. Sent to this app&apos;s server as a header on each routing call and forwarded to TypeSafe. Never shown on screen,
              never logged, so the page stays safe to stream.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon -mr-2 -mt-1 shrink-0" onClick={close} aria-label="Close">
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs">
          <span className="text-muted">Status</span>
          {hasKey ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Your key is saved in this browser
            </span>
          ) : serverHasKey ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" /> Using the server&apos;s key
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-medium text-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" /> No key · demo mode
            </span>
          )}
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            type="password"
            className="field min-w-0 flex-1 font-mono"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={hasKey ? "Paste a new key to replace the saved one" : "Paste your TypeSafe API key"}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            aria-label="TypeSafe API key"
          />
          <button type="submit" className="btn btn-primary shrink-0" disabled={!draft.trim()}>
            Save
          </button>
        </form>

        <div className="mt-3 flex min-h-5 items-center justify-between gap-3 text-xs">
          <span className={notice ? (notice.tone === "ok" ? "text-ink-2" : "text-bad") : "text-muted"} role="status">
            {notice?.text ?? "The key is only ever read from storage when a request is sent."}
          </span>
          {hasKey && (
            <button type="button" className="btn btn-ghost h-7 px-2 text-xs text-muted hover:!text-bad" onClick={clear}>
              Remove key
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
