import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { sessionSchema } from "@gh-cp-chat-analyser/domain";
import { createApp } from "./app.js";
import { listLearnScenarios } from "./data-sources/learn-scenarios/loader.js";

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
  it("returns ok status", async () => {
    const app = createApp();

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
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

    const response = await request(app).get(`/api/learn/scenarios/${expected.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(expected);
  });

  it("returns 404 for an unknown scenario id", async () => {
    const app = createApp();

    const response = await request(app).get("/api/learn/scenarios/does-not-exist");

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
    const app = createApp({ sessionStoreDbPath: path.join(dir, "does-not-exist.db") });

    const response = await request(app).get("/api/sessions");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });
});

describe("GET /api/sessions/:id", () => {
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

  it("returns the full analyzed session with real turns, usage marked unavailable", async () => {
    const app = createApp({ sessionStoreDbPath: dbPath });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.status).toBe(200);
    expect(() => sessionSchema.parse(response.body)).not.toThrow();
    expect(response.body.turns).toHaveLength(1);
    expect(response.body.turns[0].userMessage).toBe("hi");
    expect(response.body.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: "main.jsonl parsing not yet implemented",
    });
    expect(response.body.usageDataAvailable).toBe(false);
  });

  it("returns 404 for a session filtered out by the agent_name scoping rule", async () => {
    const app = createApp({ sessionStoreDbPath: dbPath });

    const response = await request(app).get("/api/sessions/session-2");

    expect(response.status).toBe(404);
  });

  it("returns 404 for an unknown session id", async () => {
    const app = createApp({ sessionStoreDbPath: dbPath });

    const response = await request(app).get("/api/sessions/does-not-exist");

    expect(response.status).toBe(404);
  });

  it("returns 404 when no session store db is available", async () => {
    const app = createApp({ sessionStoreDbPath: path.join(dir, "does-not-exist.db") });

    const response = await request(app).get("/api/sessions/session-1");

    expect(response.status).toBe(404);
  });
});
