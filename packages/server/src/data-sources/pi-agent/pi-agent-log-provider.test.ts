import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { describeLogProviderContract } from "../log-providers/contract.js";
import { PiAgentLogProvider } from "./pi-agent-log-provider.js";
import { computePiFileHash } from "./session-id.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/pi-agent",
);

describe("PiAgentLogProvider", () => {
  it("checkAvailability reports unavailable when no sessions directory is configured", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: null });

    await expect(provider.checkAvailability()).resolves.toEqual({
      available: false,
      unavailableReason: "No pi sessions directory is configured.",
    });
  });

  it("checkAvailability reports unavailable when the configured directory does not exist", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: path.join(fixturesDir, "does-not-exist") });

    const availability = await provider.checkAvailability();

    expect(availability.available).toBe(false);
    expect(availability.unavailableReason).toContain("does not exist");
  });

  it("checkAvailability reports available when at least one session file is present", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

    await expect(provider.checkAvailability()).resolves.toEqual({ available: true });
  });

  it("lists one session per unforked file, with providerId set and turns empty", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

    const sessions = await provider.listSessions();
    const normal = sessions.find((s) => s.id === computePiFileHash(path.join(fixturesDir, "normal-session.jsonl")));

    expect(normal).toBeDefined();
    expect(normal?.providerId).toBe("pi-agent");
    expect(normal?.turns).toEqual([]);
    expect(normal?.mode).toBe("analyze");
  });

  it("lists sessions ordered from most recent to oldest by startedAt", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

    const sessions = await provider.listSessions();
    const startedAts = sessions.map((s) => s.startedAt);

    expect(startedAts).toEqual([...startedAts].sort().reverse());
  });

  it("lists one session per leaf branch for a forked file", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

    const sessions = await provider.listSessions();
    const forkedFilePath = path.join(fixturesDir, "forked-session.jsonl");
    const forkedFileHash = computePiFileHash(forkedFilePath);
    const branches = sessions.filter((s) => s.id.startsWith(forkedFileHash));

    expect(branches).toHaveLength(2);
    expect(new Set(branches.map((s) => s.id)).size).toBe(2);
  });

  it("readSession returns real per-turn usage numbers for the normal fixture, including cache read/write and tool calls", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
    const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

    const session = await provider.readSession(id);

    expect(session?.usageDataAvailable).toBe(true);
    expect(session?.turns).toHaveLength(2);
    expect(session?.turns[0].usage.uncachedInput).toEqual({ known: true, value: 1250 });
    expect(session?.turns[0].usage.output).toEqual({ known: true, value: 120 });
    expect(session?.turns[0].usage.cacheWrite).toEqual({ known: true, value: 300 });
    expect(session?.turns[0].usage.cacheRead).toEqual({ known: true, value: 1500 });
    expect(session?.turns[0].usage.roundsCount).toBe(2);
    expect(session?.turns[0].toolCalls).toHaveLength(1);
    expect(session?.turns[0].toolCalls[0].name).toBe("read_file");
    expect(session?.turns[0].usage.costAiCredits.known).toBe(false);
    expect(session?.model).toBe("claude-sonnet-5");
  });

  it("readSession marks usageDataAvailable false when no assistant message carries usage data", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
    const id = computePiFileHash(path.join(fixturesDir, "no-usage-session.jsonl"));

    const session = await provider.readSession(id);

    expect(session?.usageDataAvailable).toBe(false);
    expect(session?.turns[0].usage.output.known).toBe(false);
  });

  it("readSession skips malformed lines without throwing", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
    const id = computePiFileHash(path.join(fixturesDir, "malformed-lines-session.jsonl"));

    const session = await provider.readSession(id);

    expect(session?.turns).toHaveLength(1);
    expect(session?.turns[0].usage.output).toEqual({ known: true, value: 15 });
  });

  it("readSession returns null for an unknown id", async () => {
    const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

    await expect(provider.readSession("does-not-exist")).resolves.toBeNull();
  });

  describe("readTurnDetail", () => {
    it("returns rounds for a known session/turn", async () => {
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
      const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

      const detail = await provider.readTurnDetail(id, 0);

      expect(detail).not.toBeNull();
      expect(detail!.rounds).toHaveLength(2);
      expect(detail!.rounds[1].request.toolCalls).toHaveLength(1);
    });

    it("returns null for an unknown session id", async () => {
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });

      await expect(provider.readTurnDetail("does-not-exist", 0)).resolves.toBeNull();
    });

    it("returns null for a turnIndex beyond the session's turn count", async () => {
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
      const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

      await expect(provider.readTurnDetail(id, 999)).resolves.toBeNull();
    });
  });

  describe("system-prompt sidecar log", () => {
    // The sidecar's sessionFile must resolve to the real, unmodified
    // normal-session.jsonl fixture's absolute path, so this is synthesized
    // into a tmpdir at test time rather than checked in — a static fixture
    // would embed a checkout-path-dependent absolute path.
    let sidecarDir: string;

    beforeEach(() => {
      sidecarDir = mkdtempSync(path.join(tmpdir(), "pi-system-prompt-sidecar-"));
    });

    afterEach(() => {
      rmSync(sidecarDir, { recursive: true, force: true });
    });

    function writeSidecarLog(sessionFile: string, overrides: Record<string, unknown> = {}): string {
      const logPath = path.join(sidecarDir, "system-prompts.jsonl");
      const record = {
        sessionId: "session-1",
        sessionFile,
        capturedAt: "2026-09-03T10:00:00.000Z",
        cwd: "/home/dev/project",
        systemPromptChars: 11,
        systemPrompt: "You are Pi.",
        selectedTools: ["read_file"],
        ...overrides,
      };
      writeFileSync(logPath, `${JSON.stringify(record)}\n`);
      return logPath;
    }

    it("readSession populates systemPrompt from a matching sidecar record", async () => {
      const normalSessionPath = path.join(fixturesDir, "normal-session.jsonl");
      const systemPromptLogPath = writeSidecarLog(normalSessionPath);
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir, systemPromptLogPath });
      const id = computePiFileHash(normalSessionPath);

      const session = await provider.readSession(id);

      expect(session?.systemPrompt).toEqual([
        {
          kind: "built-in",
          label: "Base system prompt (11 characters)",
          tokenCount: expect.objectContaining({ known: true, estimated: true }),
        },
        {
          kind: "tool-definitions",
          label: "Tool definitions (1 tools)",
          tokenCount: expect.objectContaining({ known: false }),
        },
      ]);
    });

    it("readSession leaves systemPrompt unset when systemPromptLogPath is omitted", async () => {
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir });
      const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

      const session = await provider.readSession(id);

      expect(session?.systemPrompt).toBeUndefined();
    });

    it("readSession leaves systemPrompt unset when the sidecar log has no matching record", async () => {
      const systemPromptLogPath = writeSidecarLog("/some/other/session.jsonl");
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir, systemPromptLogPath });
      const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

      const session = await provider.readSession(id);

      expect(session?.systemPrompt).toBeUndefined();
    });

    it("readSystemPromptText returns the captured prompt text for a matching sidecar record", async () => {
      const normalSessionPath = path.join(fixturesDir, "normal-session.jsonl");
      const systemPromptLogPath = writeSidecarLog(normalSessionPath);
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir, systemPromptLogPath });
      const id = computePiFileHash(normalSessionPath);

      await expect(provider.readSystemPromptText(id)).resolves.toBe("You are Pi.");
    });

    it("readSystemPromptText returns null when there is no matching sidecar record", async () => {
      const systemPromptLogPath = writeSidecarLog("/some/other/session.jsonl");
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir, systemPromptLogPath });
      const id = computePiFileHash(path.join(fixturesDir, "normal-session.jsonl"));

      await expect(provider.readSystemPromptText(id)).resolves.toBeNull();
    });

    it("readSystemPromptText returns null for an unknown session id", async () => {
      const systemPromptLogPath = writeSidecarLog(path.join(fixturesDir, "normal-session.jsonl"));
      const provider = new PiAgentLogProvider({ sessionsDirPath: fixturesDir, systemPromptLogPath });

      await expect(provider.readSystemPromptText("does-not-exist")).resolves.toBeNull();
    });
  });
});

describeLogProviderContract("PiAgentLogProvider", {
  buildAvailableProvider: () => new PiAgentLogProvider({ sessionsDirPath: fixturesDir }),
  knownSessionId: computePiFileHash(path.join(fixturesDir, "normal-session.jsonl")),
  unknownSessionId: "does-not-exist",
  buildUnavailableProvider: () => new PiAgentLogProvider({ sessionsDirPath: null }),
  turnIndexWithRoundTrip: 0,
});
