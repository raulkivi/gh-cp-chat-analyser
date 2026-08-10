import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_ACTIVE_PROVIDER_ID,
  readActiveProviderId,
  writeActiveProviderId,
} from "./app-settings.js";

describe("app-settings (active provider persistence)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "app-settings-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("defaults to 'vscode' when no settings file exists yet", () => {
    expect(readActiveProviderId(dir)).toBe(DEFAULT_ACTIVE_PROVIDER_ID);
  });

  it("round-trips a written active provider id", () => {
    writeActiveProviderId(dir, "mitmproxy");

    expect(readActiveProviderId(dir)).toBe("mitmproxy");
  });

  it("degrades to the default when the settings file is corrupt", () => {
    writeFileSync(path.join(dir, "settings.json"), "{not valid json", "utf-8");

    expect(readActiveProviderId(dir)).toBe(DEFAULT_ACTIVE_PROVIDER_ID);
  });

  it("creates the settings directory if it doesn't exist yet", () => {
    const nestedDir = path.join(dir, "nested", "config");

    writeActiveProviderId(nestedDir, "vscode");

    expect(readActiveProviderId(nestedDir)).toBe("vscode");
  });
});
