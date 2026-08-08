import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readVscodeSettings } from "./read-vscode-settings.js";

describe("readVscodeSettings", () => {
  let dir: string;
  let settingsPath: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "read-vscode-settings-test-"));
    settingsPath = path.join(dir, "settings.json");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns logging disabled and no retention override when settingsPath is null", () => {
    expect(readVscodeSettings(null)).toEqual({
      loggingEnabled: false,
      maxRetainedSessionLogs: null,
    });
  });

  it("parses a JSONC settings.json with comments and trailing commas", () => {
    writeFileSync(
      settingsPath,
      `{
        // enable rich usage logging
        "github.copilot.chat.agentDebugLog.fileLogging.enabled": true,
        "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs": 200,
      }`,
    );

    expect(readVscodeSettings(settingsPath)).toEqual({
      loggingEnabled: true,
      maxRetainedSessionLogs: 200,
    });
  });

  it("treats the setting as disabled when absent", () => {
    writeFileSync(settingsPath, "{}");

    expect(readVscodeSettings(settingsPath)).toEqual({
      loggingEnabled: false,
      maxRetainedSessionLogs: null,
    });
  });

  it("recognizes the deprecated agentDebugLog.enabled alias", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({ "github.copilot.chat.agentDebugLog.enabled": true }),
    );

    expect(readVscodeSettings(settingsPath).loggingEnabled).toBe(true);
  });

  it("returns maxRetainedSessionLogs null when the value isn't a number", () => {
    writeFileSync(
      settingsPath,
      JSON.stringify({
        "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs":
          "200",
      }),
    );

    expect(readVscodeSettings(settingsPath).maxRetainedSessionLogs).toBeNull();
  });
});
