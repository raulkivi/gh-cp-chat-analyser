import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { describeLogProviderContract } from "../contract.js";
import { anthropicDecoder } from "./decoders/anthropic.js";
import { openAiDecoder } from "./decoders/openai.js";
import { UNRECOGNIZED_VENDOR_REASON } from "./decoders/registry.js";
import { MitmproxyLogProvider } from "./mitmproxy-log-provider.js";
import { computeHarSessionId } from "./session-id.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../fixtures/mitmproxy",
);

describe("MitmproxyLogProvider", () => {
  it("checkAvailability reports unavailable when no captures directory is configured", async () => {
    const provider = new MitmproxyLogProvider({ capturesDirPath: null });

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      unavailableReason: "No mitmproxy captures directory is configured.",
    });
  });

  it("checkAvailability reports unavailable when the configured directory has no .har files", async () => {
    const emptyDir = path.resolve(fixturesDir, "../jsonl");
    const provider = new MitmproxyLogProvider({ capturesDirPath: emptyDir });

    const availability = await provider.checkAvailability();

    expect(availability.available).toBe(false);
    expect(availability.unavailableReason).toContain("No .har files found");
  });

  it("checkAvailability reports available when at least one .har file is present", async () => {
    const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

    await expect(provider.checkAvailability()).resolves.toEqual({ available: true });
  });

  it("lists one session per .har file, none from unrelated files in the directory", async () => {
    const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

    const sessions = await provider.listSessions();

    expect(sessions.length).toBeGreaterThanOrEqual(7);
    for (const session of sessions) {
      expect(session.providerId).toBe("mitmproxy");
      expect(session.turns).toEqual([]);
    }
  });

  it("with zero decoders registered, every exchange comes back unavailable (unrecognized vendor)", async () => {
    const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir, decoders: [] });
    const id = computeHarSessionId(path.join(fixturesDir, "anthropic-non-streamed.har"));

    const session = await provider.readSession(id);

    expect(session?.usageDataAvailable).toBe(false);
    expect(session?.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: UNRECOGNIZED_VENDOR_REASON,
    });
  });

  it("with decoders registered, decodes real usage numbers from a recognized Anthropic exchange", async () => {
    const provider = new MitmproxyLogProvider({
      capturesDirPath: fixturesDir,
      decoders: [anthropicDecoder, openAiDecoder],
    });
    const id = computeHarSessionId(path.join(fixturesDir, "anthropic-non-streamed.har"));

    const session = await provider.readSession(id);

    expect(session?.usageDataAvailable).toBe(true);
    expect(session?.turns[0].usage.uncachedInput).toEqual({ known: true, value: 120 });
    expect(session?.model).toBe("claude-3-5-haiku-20241022");
  });

  it("sets roundsCount to 1 for every turn, since each HAR entry is one complete exchange", async () => {
    const provider = new MitmproxyLogProvider({
      capturesDirPath: fixturesDir,
      decoders: [anthropicDecoder, openAiDecoder],
    });
    const id = computeHarSessionId(path.join(fixturesDir, "anthropic-non-streamed.har"));

    const session = await provider.readSession(id);

    expect(session?.turns[0].usage.roundsCount).toBe(1);
  });

  it("returns null for a session id no configured .har file resolves to", async () => {
    const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

    await expect(provider.readSession("does-not-exist")).resolves.toBeNull();
  });

  describe("readTurnDetail", () => {
    const id = computeHarSessionId(path.join(fixturesDir, "anthropic-non-streamed.har"));

    it("returns exactly one round with the full raw request/response body as text parts", async () => {
      const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

      const detail = await provider.readTurnDetail(id, 0);

      expect(detail).not.toBeNull();
      expect(detail!.turnIndex).toBe(0);
      expect(detail!.userMessage).toEqual([]);
      expect(detail!.rounds).toHaveLength(1);
      expect(detail!.rounds[0].request.toolCalls).toEqual([]);
      expect(detail!.rounds[0].request.addedMessages[0].kind).toBe("text");
      expect(detail!.rounds[0].response.response[0].kind).toBe("text");
    });

    it("returns null for an unknown session id", async () => {
      const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

      await expect(provider.readTurnDetail("does-not-exist", 0)).resolves.toBeNull();
    });

    it("returns null for a turnIndex beyond this HAR file's entry count", async () => {
      const provider = new MitmproxyLogProvider({ capturesDirPath: fixturesDir });

      await expect(provider.readTurnDetail(id, 999)).resolves.toBeNull();
    });
  });
});

describeLogProviderContract("MitmproxyLogProvider", {
  buildAvailableProvider: () =>
    new MitmproxyLogProvider({
      capturesDirPath: fixturesDir,
      decoders: [anthropicDecoder, openAiDecoder],
    }),
  knownSessionId: computeHarSessionId(path.join(fixturesDir, "anthropic-non-streamed.har")),
  unknownSessionId: "does-not-exist",
  buildUnavailableProvider: () => new MitmproxyLogProvider({ capturesDirPath: null }),
  turnIndexWithRoundTrip: 0,
});
