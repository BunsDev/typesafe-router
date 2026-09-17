// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { API_KEY_HEADER, apiKeyHeaders, clearApiKey, hasStoredApiKey, saveApiKey } from "@/lib/apiKeyStorage";
import { installFakeStorage, uninstallFakeStorage } from "@/lib/testing/fakeStorage";

afterEach(uninstallFakeStorage);

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
