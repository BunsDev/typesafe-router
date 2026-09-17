// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { API_KEY_HEADER, apiKeyHeaders, clearApiKey, hasStoredApiKey, saveApiKey } from "@/lib/apiKeyStorage";

/** Minimal localStorage stand-in so the helpers can be exercised outside a browser. */
function installFakeStorage() {
  const store = new Map<string, string>();
  const fake = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  (globalThis as unknown as { window: unknown }).window = { localStorage: fake };
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("apiKeyStorage", () => {
  it("is a safe no-op without a window", () => {
    expect(hasStoredApiKey()).toBe(false);
    expect(saveApiKey("sk-test-1234567890")).toBe(false);
    expect(apiKeyHeaders()).toEqual({});
  });

  it("saves, reports presence, exposes the key only via headers, and clears", () => {
    installFakeStorage();
    expect(hasStoredApiKey()).toBe(false);
    expect(saveApiKey("  sk-test-1234567890  ")).toBe(true);
    expect(hasStoredApiKey()).toBe(true);
    expect(apiKeyHeaders()).toEqual({ [API_KEY_HEADER]: "sk-test-1234567890" });
    clearApiKey();
    expect(hasStoredApiKey()).toBe(false);
    expect(apiKeyHeaders()).toEqual({});
  });

  it("treats an empty save as a clear", () => {
    installFakeStorage();
    saveApiKey("sk-test-1234567890");
    saveApiKey("   ");
    expect(hasStoredApiKey()).toBe(false);
  });
});
