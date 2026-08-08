import { describe, expect, it } from "vitest";
import { sessionSchema } from "@gh-cp-chat-analyser/domain";
import type {
  SessionFileRow,
  SessionRow,
  TurnRow,
} from "../../data-sources/sqlite/session-store.js";
import {
  buildSession,
  buildSessionSummary,
  LOGGING_NEVER_ENABLED_REASON,
  USAGE_UNAVAILABLE_REASON,
} from "./session-enricher.js";

const sessionRow: SessionRow = {
  id: "session-1",
  cwd: "/repo",
  repository: "org/repo",
  branch: "main",
  host_type: "desktop",
  summary: "Fix the bug",
  agent_name: "GitHub Copilot Chat",
  agent_description: "chat",
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-02T00:00:00.000Z",
};

describe("buildSessionSummary", () => {
  it("produces a schema-valid Session with no turns and usage unavailable", () => {
    const session = buildSessionSummary(sessionRow);

    expect(() => sessionSchema.parse(session)).not.toThrow();
    expect(session.id).toBe("session-1");
    expect(session.mode).toBe("analyze");
    expect(session.title).toBe("Fix the bug");
    expect(session.turns).toEqual([]);
    expect(session.usageDataAvailable).toBe(false);
  });

  it("falls back to repository, then cwd, then a generated title when summary is missing", () => {
    expect(buildSessionSummary({ ...sessionRow, summary: null }).title).toBe(
      "org/repo",
    );
    expect(
      buildSessionSummary({ ...sessionRow, summary: null, repository: null })
        .title,
    ).toBe("/repo");
    expect(
      buildSessionSummary({
        ...sessionRow,
        summary: null,
        repository: null,
        cwd: null,
      }).title,
    ).toBe("Session session-1");
  });
});

describe("buildSession", () => {
  const turnRows: TurnRow[] = [
    {
      id: 1,
      session_id: "session-1",
      turn_index: 0,
      user_message: "first",
      assistant_response: "first reply",
      timestamp: "2026-01-01T00:00:00.000Z",
    },
    {
      id: 2,
      session_id: "session-1",
      turn_index: 1,
      user_message: "hi",
      assistant_response: "hello",
      timestamp: "2026-01-01T00:00:01.000Z",
    },
  ];
  const fileRows: SessionFileRow[] = [
    {
      id: 1,
      session_id: "session-1",
      file_path: "src/a.ts",
      tool_name: "read_file",
      turn_index: 0,
      first_seen_at: "2026-01-01T00:00:00.500Z",
    },
    {
      id: 2,
      session_id: "session-1",
      file_path: "src/b.ts",
      tool_name: "read_file",
      turn_index: 0,
      first_seen_at: "2026-01-01T00:00:00.600Z",
    },
    {
      id: 3,
      session_id: "session-1",
      file_path: "src/c.ts",
      tool_name: "edit_file",
      turn_index: 1,
      first_seen_at: "2026-01-01T00:00:01.500Z",
    },
  ];
  it("produces a schema-valid Session with real turns", () => {
    const session = buildSession(sessionRow, turnRows, fileRows, "missing");

    expect(() => sessionSchema.parse(session)).not.toThrow();
    expect(session.mode).toBe("analyze");
    expect(session.usageDataAvailable).toBe(false);
    expect(session.turns).toHaveLength(2);
  });

  it("maps user/assistant messages and marks every usage field known:false", () => {
    const session = buildSession(sessionRow, turnRows, fileRows, "missing");
    const [firstTurn] = session.turns;

    expect(firstTurn.index).toBe(0);
    expect(firstTurn.userMessage).toBe("first");
    expect(firstTurn.assistantResponse).toBe("first reply");
    for (const field of [
      "uncachedInput",
      "cacheWrite",
      "cacheRead",
      "tool",
      "vision",
      "reasoning",
      "output",
      "costUsd",
    ] as const) {
      expect(firstTurn.usage[field]).toEqual({
        known: false,
        reason: USAGE_UNAVAILABLE_REASON,
      });
    }
    expect(firstTurn.usage.model).toBe("unknown");
  });

  it("groups session_files into toolCalls per turn by tool_name", () => {
    const session = buildSession(sessionRow, turnRows, fileRows, "missing");
    const [firstTurn, secondTurn] = session.turns;

    expect(firstTurn.toolCalls).toEqual([
      {
        name: "read_file",
        argsSummary: "src/a.ts, src/b.ts",
        filesTouched: ["src/a.ts", "src/b.ts"],
      },
    ]);
    expect(secondTurn.toolCalls).toEqual([
      {
        name: "edit_file",
        argsSummary: "src/c.ts",
        filesTouched: ["src/c.ts"],
      },
    ]);
  });

  it("handles a turn with no touched files", () => {
    const session = buildSession(sessionRow, turnRows, [], "missing");

    expect(session.turns[0].toolCalls).toEqual([]);
  });

  it("uses the actionable reason when logging was never enabled for this session", () => {
    const session = buildSession(
      sessionRow,
      turnRows,
      fileRows,
      "logging-never-enabled",
    );

    expect(session.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: LOGGING_NEVER_ENABLED_REASON,
    });
  });

  it("uses the generic reason when main.jsonl is missing", () => {
    const session = buildSession(sessionRow, turnRows, fileRows, "missing");

    expect(session.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: USAGE_UNAVAILABLE_REASON,
    });
  });

  it("uses the generic reason when events are present but no extractor produced usage yet", () => {
    const session = buildSession(
      sessionRow,
      turnRows,
      fileRows,
      "events-present",
    );

    expect(session.turns[0].usage.uncachedInput).toEqual({
      known: false,
      reason: USAGE_UNAVAILABLE_REASON,
    });
    expect(session.usageDataAvailable).toBe(false);
  });
});
