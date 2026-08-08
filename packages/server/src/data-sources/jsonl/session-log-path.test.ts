import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isValidSessionId,
  resolveDebugLogsDirPath,
  resolveMainJsonlPath,
} from "./session-log-path.js";

describe("resolveDebugLogsDirPath", () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(path.join(tmpdir(), "session-log-path-test-"));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("returns null when no VS Code install is present", () => {
    expect(
      resolveDebugLogsDirPath({ platform: "linux", homeDir: fakeHome }),
    ).toBeNull();
  });

  it("returns the debug-logs dir path (even if it doesn't exist yet) when VS Code is installed", () => {
    mkdirSync(path.join(fakeHome, ".config", "Code - Insiders"), {
      recursive: true,
    });

    expect(
      resolveDebugLogsDirPath({ platform: "linux", homeDir: fakeHome }),
    ).toBe(
      path.join(
        fakeHome,
        ".config",
        "Code - Insiders",
        "User",
        "globalStorage",
        "github.copilot-chat",
        "debug-logs",
      ),
    );
  });
});

describe("isValidSessionId", () => {
  it("accepts UUID-shaped and simple alphanumeric-with-dashes ids", () => {
    expect(isValidSessionId("2137cba5-8ad3-4f7c-9a18-f8d716ed8683")).toBe(true);
    expect(isValidSessionId("session-1")).toBe(true);
  });

  it("rejects ids that could escape the debug-logs directory", () => {
    expect(isValidSessionId("../../etc/passwd")).toBe(false);
    expect(isValidSessionId("a/b")).toBe(false);
    expect(isValidSessionId("..")).toBe(false);
    expect(isValidSessionId("")).toBe(false);
  });
});

describe("resolveMainJsonlPath", () => {
  it("joins the debug-logs dir, session id, and main.jsonl for a valid id", () => {
    expect(resolveMainJsonlPath("/debug-logs", "session-1")).toBe(
      path.join("/debug-logs", "session-1", "main.jsonl"),
    );
  });

  it("returns null for an invalid session id", () => {
    expect(resolveMainJsonlPath("/debug-logs", "../etc/passwd")).toBeNull();
  });

  it("returns null when the debug-logs dir path is null", () => {
    expect(resolveMainJsonlPath(null, "session-1")).toBeNull();
  });
});
