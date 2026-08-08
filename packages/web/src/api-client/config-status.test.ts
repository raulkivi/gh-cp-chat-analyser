import { describe, expect, it, vi, afterEach } from "vitest";
import type { ConfigStatus } from "@gh-cp-chat-analyser/domain";
import { fetchConfigStatus } from "./config-status.js";

const status = {
  checkedAt: "2026-08-08T00:00:00.000Z",
  vscodeUserSettingsPath: null,
  loggingEnabled: false,
  maxRetainedSessionLogs: null,
  warnings: [],
} as unknown as ConfigStatus;

describe("config-status api-client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the config status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(status) }),
    );

    const result = await fetchConfigStatus();

    expect(fetch).toHaveBeenCalledWith("/api/config/status");
    expect(result).toEqual(status);
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    await expect(fetchConfigStatus()).rejects.toThrow(/500/);
  });
});
