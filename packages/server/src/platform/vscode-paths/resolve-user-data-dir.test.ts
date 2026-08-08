import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveUserDataDir } from "./resolve-user-data-dir.js";

describe("resolveUserDataDir", () => {
  let fakeHome: string;

  beforeEach(() => {
    fakeHome = mkdtempSync(path.join(tmpdir(), "vscode-paths-test-"));
  });

  afterEach(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("returns null when no VS Code install is present", () => {
    expect(resolveUserDataDir({ platform: "linux", homeDir: fakeHome })).toBeNull();
  });

  it("returns the Insiders user-data dir when only Insiders is installed", () => {
    const insidersDir = path.join(fakeHome, ".config", "Code - Insiders");
    mkdirSync(insidersDir, { recursive: true });

    expect(resolveUserDataDir({ platform: "linux", homeDir: fakeHome })).toBe(insidersDir);
  });

  it("returns the Stable user-data dir when only Stable is installed", () => {
    const stableDir = path.join(fakeHome, ".config", "Code");
    mkdirSync(stableDir, { recursive: true });

    expect(resolveUserDataDir({ platform: "linux", homeDir: fakeHome })).toBe(stableDir);
  });

  it("prefers Insiders over Stable when both are installed", () => {
    const insidersDir = path.join(fakeHome, ".config", "Code - Insiders");
    const stableDir = path.join(fakeHome, ".config", "Code");
    mkdirSync(insidersDir, { recursive: true });
    mkdirSync(stableDir, { recursive: true });

    expect(resolveUserDataDir({ platform: "linux", homeDir: fakeHome })).toBe(insidersDir);
  });

  it("returns null on platforms other than linux (stub, per architecture §13)", () => {
    const insidersDir = path.join(fakeHome, ".config", "Code - Insiders");
    mkdirSync(insidersDir, { recursive: true });

    expect(resolveUserDataDir({ platform: "darwin", homeDir: fakeHome })).toBeNull();
    expect(resolveUserDataDir({ platform: "win32", homeDir: fakeHome })).toBeNull();
  });
});
