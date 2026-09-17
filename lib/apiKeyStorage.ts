/**
 * Browser-side storage for a user-supplied TypeSafe API key.
 *
 * Rules, so the UI stays safe to screen-share or stream:
 *   - The key lives only in this browser's localStorage, never in React state
 *     that gets rendered, never in the URL, never in a log entry.
 *   - Nothing here returns the key to anything except the request header
 *     builder. The UI only ever asks "is a key saved?" (`hasStoredApiKey`).
 *   - Every access is wrapped in try/catch: private windows and locked-down
 *     browsers can throw on localStorage access.
 *
 * The key is sent to our own `/api/route` as the `x-typesafe-api-key` header,
 * where the server forwards it to TypeSafe and never logs it.
 */

export const API_KEY_STORAGE_KEY = "jev-router:api-key";
export const API_KEY_HEADER = "x-typesafe-api-key";

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) l();
}

/**
 * Subscribe to changes made through `saveApiKey` / `clearApiKey` (and to
 * `storage` events from other tabs). Shaped for React's `useSyncExternalStore`.
 */
export function subscribeApiKey(listener: Listener): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === API_KEY_STORAGE_KEY) listener();
  };
  try {
    window.addEventListener("storage", onStorage);
  } catch {
    // no window
  }
  return () => {
    listeners.delete(listener);
    try {
      window.removeEventListener("storage", onStorage);
    } catch {
      // no window
    }
  };
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function hasStoredApiKey(): boolean {
  try {
    return Boolean(storage()?.getItem(API_KEY_STORAGE_KEY)?.trim());
  } catch {
    return false;
  }
}

/** Save a key. Whitespace is trimmed; an empty string clears it. */
export function saveApiKey(key: string): boolean {
  try {
    const s = storage();
    if (!s) return false;
    const trimmed = key.trim();
    if (!trimmed) {
      s.removeItem(API_KEY_STORAGE_KEY);
    } else {
      s.setItem(API_KEY_STORAGE_KEY, trimmed);
    }
    notify();
    return true;
  } catch {
    return false;
  }
}

export function clearApiKey(): void {
  try {
    storage()?.removeItem(API_KEY_STORAGE_KEY);
  } catch {
    // nothing to do
  }
  notify();
}

/**
 * Headers for a request to `/api/route`. Includes the stored key if there is
 * one. This is the ONLY function that reads the key out of storage, and it
 * hands it straight to `fetch`.
 */
export function apiKeyHeaders(): Record<string, string> {
  try {
    const key = storage()?.getItem(API_KEY_STORAGE_KEY)?.trim();
    return key ? { [API_KEY_HEADER]: key } : {};
  } catch {
    return {};
  }
}
