/**
 * Minimal `window.localStorage` stand-in so the browser-only storage helpers
 * can be exercised under vitest's node environment. Test-only.
 */

export function installFakeStorage(opts: { throwing?: boolean } = {}): Map<string, string> {
  const store = new Map<string, string>();
  const boom = () => {
    throw new Error("QuotaExceededError");
  };
  const fake = opts.throwing
    ? { getItem: boom, setItem: boom, removeItem: boom }
    : {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      };
  (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
  return store;
}

export function uninstallFakeStorage(): void {
  delete (globalThis as unknown as { window?: unknown }).window;
}
