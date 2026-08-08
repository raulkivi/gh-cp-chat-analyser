import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { configStatusSchema, sessionSchema } from "@gh-cp-chat-analyser/domain";
import { createApp } from "./app.js";
import { listLearnScenarios } from "./data-sources/learn-scenarios/loader.js";
import {
  LOGGING_NEVER_ENABLED_REASON,
  TOOL_CALL_TOKEN_COUNT_UNAVAILABLE_REASON,
  USAGE_UNAVAILABLE_REASON,
} from "./services/session-enricher/session-enricher.js";

const SESSION_STORE_SCHEMA = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    cwd TEXT,
    repository TEXT,
    branch TEXT,
    host_type TEXT,
    summary TEXT,
    agent_name TEXT,
    agent_description TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE turns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn_index INTEGER NOT NULL,
    user_message TEXT,
    assistant_response TEXT,
    timestamp TEXT
  );
  CREATE TABLE checkpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    checkpoint_number INTEGER NOT NULL,
    title TEXT,
    overview TEXT,
    history TEXT,
    work_done TEXT,
    technical_details TEXT,
    important_files TEXT,
    next_steps TEXT,
    created_at TEXT
  );
  CREATE TABLE session_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    tool_name TEXT,
    turn_index INTEGER,
    first_seen_at TEXT
  );
`;

function seedFixtureDb(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  db.exec(SESSION_STORE_SCHEMA);
  db.exec(`
    INSERT INTO sessions (id, cwd, repository, branch, host_type, summary, agent_name, agent_description, created_at, updated_at)
    VALUES
      ('session-1', '/repo', 'org/repo', 'main', 'desktop', 'Fix the bug', 'GitHub Copilot Chat', 'chat', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
      ('session-2', '/repo', 'org/repo', 'main', 'desktop', 'Not chat', 'panel/editAgent', 'edit', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

    INSERT INTO turns (session_id, turn_index, user_message, assistant_response, timestamp)
    VALUES
      ('session-1', 0, 'hi', 'hello', '2026-01-01T00:00:00.000Z');
  `);
  db.close();
}

describe("GET /api/health", () => {
  it("returns ok status and the app version", async () => {
    const app = createApp();

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok", version: "0.2.0" });
  });
});

describe("GET /api/learn/scenarios", () => {
  it("returns every bundled learn scenario as valid Sessions", async () => {
    const app = createApp();

    const response = await request(app).get("/api/learn/scenarios");

    expect(response.status).toBe(200);
    expect(response.body.length).toBe(listLearnScenarios().length);
    for (const scenario of response.body) {
      expect(() => sessionSchema.parse(scenario)).not.toThrow();
      expect(scenario.mode).toBe("learn");
    }
  });
});

describe("GET /api/learn/scenarios/:id", () => {
  it("returns the full Session for a known scenario id", async () => {
    const app = createApp();
    const [expected] = listLearnScenarios();

    const response = await request(app).get(
      `/api/learn/scenarios/${expected.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
  });

  it("returns 404 for an unknown scenario id", async () => {
    const app = createApp();

    const response = await request(app).get(
      "/api/learn/scenarios/does-not-exist",
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /api/sessions", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "app-test-session-store-"));
    dbPath = path.join(dir, "session-store.db");
    seedFixtureDb(dbPath);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns only GitHub Copilot Chat sessions as schema-valid summaries", async () => {
    const app = createApp({ sessionStoreDbPath: dbPath });

    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    const [session] = response.body;
    expect(() => sessionSchema.parse(session)).not.toThrow();
    expect(session.id).toBe("session-1");
    expect(session.mode).toBe("analyze");
    expect(session.turns).toEqual([]);
  });

  it("returns an empty list when no session store db is available", async () => {
    const app = createApp({
      sessionStoreDbPath: path.join(dir, "does-not-exist.db"),
    });

    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe("GET /api/sessions/:id", () => {
  let dir: string;
  let dbPath: string;
  let debugLogsDirPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "app-test-session-store-"));
    dbPath = path.join(dir, "session-store.db");
    seedFixtureDb(dbPath);
    debugLogsDirPath = path.join(dir, "debug-logs");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns the full analyzed session with real turns, usage marked unavailable", async () => {
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.status).toBe(200);
    expect(() => sessionSchema.parse(response.body)).not.toThrow();
    expect(response.body.turns).toHaveLength(1);
    expect(response.body.turns[0].userMessage).toBe("hi");
    expect(response.body.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: USAGE_UNAVAILABLE_REASON,
    });
    expect(response.body.usageDataAvailable).toBe(false);
  });

  it("uses the actionable reason when main.jsonl only has a session_start line", async () => {
    const sessionLogDir = path.join(debugLogsDirPath, "session-1");
    mkdirSync(sessionLogDir, { recursive: true });
    writeFileSync(
      path.join(sessionLogDir, "main.jsonl"),
      `${JSON.stringify({ v: 1, ts: 1, dur: 0, sid: "session-1", type: "session_start", name: "session_start", spanId: "a", status: "ok", attrs: {} })}\n`,
    );
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.body.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: LOGGING_NEVER_ENABLED_REASON,
    });
  });

  it("uses the generic reason when main.jsonl has events but the llm_request span has an older/unknown attrs shape", async () => {
    const sessionLogDir = path.join(debugLogsDirPath, "session-1");
    mkdirSync(sessionLogDir, { recursive: true });
    const lines = [
      {
        v: 1,
        ts: 1,
        dur: 0,
        sid: "session-1",
        type: "session_start",
        name: "session_start",
        spanId: "a",
        status: "ok",
        attrs: {},
      },
      {
        v: 1,
        ts: 2,
        dur: 5,
        sid: "session-1",
        type: "llm_request",
        name: "llm_request",
        spanId: "b",
        status: "ok",
        attrs: {},
      },
    ];
    writeFileSync(
      path.join(sessionLogDir, "main.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.body.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: USAGE_UNAVAILABLE_REASON,
    });
    expect(response.body.usageDataAvailable).toBe(false);
  });

  it("returns real per-turn token numbers extracted from a session's llm_request spans", async () => {
    const sessionLogDir = path.join(debugLogsDirPath, "session-1");
    mkdirSync(sessionLogDir, { recursive: true });
    const lines = [
      {
        v: 1,
        ts: 1,
        dur: 0,
        sid: "session-1",
        type: "session_start",
        name: "session_start",
        spanId: "a",
        status: "ok",
        attrs: {},
      },
      {
        v: 1,
        ts: 2,
        dur: 0,
        sid: "session-1",
        type: "user_message",
        name: "user_message",
        spanId: "u0",
        status: "ok",
        attrs: { content: "hi" },
      },
      {
        v: 1,
        ts: 3,
        dur: 5,
        sid: "session-1",
        type: "llm_request",
        name: "llm_request",
        spanId: "b",
        status: "ok",
        attrs: {
          model: "claude-sonnet-5",
          inputTokens: 1000,
          outputTokens: 50,
          cachedTokens: 200,
        },
      },
    ];
    writeFileSync(
      path.join(sessionLogDir, "main.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(() => sessionSchema.parse(response.body)).not.toThrow();
    expect(response.body.turns[0].usage.uncachedInput).toEqual({
      known: true,
      value: 800,
    });
    expect(response.body.turns[0].usage.cacheRead).toEqual({
      known: true,
      value: 200,
    });
    expect(response.body.turns[0].usage.output).toEqual({
      known: true,
      value: 50,
    });
    expect(response.body.turns[0].usage.model).toBe("claude-sonnet-5");
    expect(response.body.usageDataAvailable).toBe(true);
    expect(response.body.model).toBe("claude-sonnet-5");
  });

  it("populates systemPrompt, toolInventory, and merges jsonl-only tool calls (Phase 6)", async () => {
    const sessionLogDir = path.join(debugLogsDirPath, "session-1");
    mkdirSync(sessionLogDir, { recursive: true });
    const lines = [
      {
        v: 1,
        ts: 1,
        dur: 0,
        sid: "session-1",
        type: "session_start",
        name: "session_start",
        spanId: "a",
        status: "ok",
        attrs: {},
      },
      {
        v: 1,
        ts: 2,
        dur: 0,
        sid: "session-1",
        type: "user_message",
        name: "user_message",
        spanId: "u0",
        status: "ok",
        attrs: { content: "hi" },
      },
      {
        v: 1,
        ts: 3,
        dur: 5,
        sid: "session-1",
        type: "tool_call",
        name: "read_file",
        spanId: "t0",
        status: "ok",
        attrs: {},
      },
      {
        v: 1,
        ts: 4,
        dur: 5,
        sid: "session-1",
        type: "llm_request",
        name: "llm_request",
        spanId: "b",
        status: "ok",
        attrs: {
          model: "claude-sonnet-5",
          inputTokens: 1000,
          outputTokens: 50,
          cachedTokens: 200,
          systemPromptFile: "system_prompt_0.json",
          toolsFile: "tools_0.json",
        },
      },
    ];
    writeFileSync(
      path.join(sessionLogDir, "main.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    );
    writeFileSync(
      path.join(sessionLogDir, "system_prompt_0.json"),
      JSON.stringify({
        content: JSON.stringify([
          { type: "text", content: "You are a helpful assistant." },
        ]),
      }),
    );
    writeFileSync(
      path.join(sessionLogDir, "tools_0.json"),
      JSON.stringify({
        content: JSON.stringify([
          { type: "function", name: "read_file", description: "d", parameters: {} },
          { type: "function", name: "create_file", description: "d", parameters: {} },
        ]),
      }),
    );
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(() => sessionSchema.parse(response.body)).not.toThrow();
    expect(response.body.toolInventory).toEqual([
      { name: "read_file", loaded: true, invokedInTurns: [0] },
      { name: "create_file", loaded: true, invokedInTurns: [] },
    ]);
    expect(response.body.systemPrompt).toEqual([
      {
        kind: "built-in",
        label: "Base system prompt (28 characters)",
        tokenCount: { known: false, reason: expect.any(String) },
      },
      {
        kind: "tool-definitions",
        label: "Tool definitions (2 tools)",
        tokenCount: { known: false, reason: expect.any(String) },
      },
    ]);
    expect(response.body.turns[0].toolCalls).toEqual([
      {
        name: "read_file",
        argsSummary: "",
        tokenCount: {
          known: false,
          reason: TOOL_CALL_TOKEN_COUNT_UNAVAILABLE_REASON,
        },
      },
    ]);
  });

  it("returns 404 for a session filtered out by the agent_name scoping rule", async () => {
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-2");

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown session id", async () => {
    const app = createApp({
      sessionStoreDbPath: dbPath,
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("returns 404 when no session store db is available", async () => {
    const app = createApp({
      sessionStoreDbPath: path.join(dir, "does-not-exist.db"),
      debugLogsDirPaths: [debugLogsDirPath],
    });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.status).toBe(404);
  });
});

describe("GET /api/config/status", () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "app-test-vscode-settings-"));
    settingsPath = path.join(dir, "settings.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns a settings-not-found warning when no settings.json is configured", async () => {
    const app = createApp({ vscodeSettingsPath: null });

    const response = await request(app).get("/api/config/status");

    expect(response.status).toBe(200);
    expect(() => configStatusSchema.parse(response.body)).not.toThrow();
    expect(response.body.warnings).toEqual([
      expect.objectContaining({ code: "settings-not-found" }),
    ]);
  });

  it("returns no warnings once logging is enabled and retention is at least 200", async () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        "github.copilot.chat.agentDebugLog.fileLogging.enabled": true,
        "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs": 200,
      }),
    );
    const app = createApp({ vscodeSettingsPath: settingsPath });

    const response = await request(app).get("/api/config/status");

    expect(response.status).toBe(200);
    expect(() => configStatusSchema.parse(response.body)).not.toThrow();
    expect(response.body.warnings).toEqual([]);
  });
});
