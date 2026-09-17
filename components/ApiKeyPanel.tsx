"use client";

import { useState, useSyncExternalStore } from "react";
import { clearApiKey, hasStoredApiKey, saveApiKey, subscribeApiKey } from "@/lib/apiKeyStorage";

type Props = {
  /** Whether the server has its own TYPESAFE_API_KEY. */
  serverHasKey: boolean;
};

/** True when a key is saved in this browser. Server-rendered as false, so there is no hydration mismatch. */
export function useHasStoredApiKey(): boolean {
  return useSyncExternalStore(subscribeApiKey, hasStoredApiKey, () => false);
}

/**
 * Lets a user route with their own TypeSafe key without touching `.env.local`.
 *
 * Designed to be safe on a livestream or screen-share:
 *   - The input is `type="password"`, so what's typed is masked.
 *   - The draft is wiped from component state the moment it is saved.
 *   - The saved key is never read back into the UI. The only thing rendered
 *     is a yes/no "a key is saved in this browser" status. No last-four, no
 *     length, no reveal button.
 */
export default function ApiKeyPanel({ serverHasKey }: Props) {
  const hasKey = useHasStoredApiKey();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function save() {
    if (!draft.trim()) return;
    const ok = saveApiKey(draft);
    setDraft(""); // never keep the key in state longer than needed
    if (!ok) {
      setNotice("Couldn't save: this browser blocks local storage.");
      return;
    }
    setNotice("Key saved in this browser. It is sent only as a request header and is never displayed.");
    setOpen(false);
  }

  function clear() {
    clearApiKey();
    setDraft("");
    setNotice("Key removed from this browser.");
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <span>API key</span>
        <span className="normal-case tracking-normal">
          {hasKey ? (
            <span className="text-teal">● your key · stored in this browser</span>
          ) : serverHasKey ? (
            <span className="text-teal">● server key (.env.local)</span>
          ) : (
            <span className="text-warn">○ none · demo mode</span>
          )}
        </span>
      </div>
      <div className="space-y-2 p-4">
        <p className="text-xs text-muted">
          Use your own TypeSafe key without editing <code className="font-mono">.env.local</code>. It is saved in this browser only, sent to this app&apos;s
          server as a header on each routing call, and forwarded to TypeSafe. It is never shown on screen, so the UI stays safe to stream.
        </p>

        {open ? (
          <form
            className="flex flex-wrap items-center gap-2"
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
              placeholder="Paste your TypeSafe API key"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              aria-label="TypeSafe API key"
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={!draft.trim()}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setDraft("");
                setOpen(false);
              }}
            >
              Cancel
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="btn" onClick={() => setOpen(true)}>
              {hasKey ? "Replace key" : "Use my own key"}
            </button>
            {hasKey && (
              <button type="button" className="btn text-muted hover:text-bad" onClick={clear}>
                Remove key
              </button>
            )}
          </div>
        )}

        {notice && (
          <p role="status" className="text-xs text-ink-2">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
