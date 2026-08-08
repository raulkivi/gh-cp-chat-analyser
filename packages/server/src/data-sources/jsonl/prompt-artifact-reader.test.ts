import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  readSystemPromptText,
  readToolDefinitionNames,
} from "./prompt-artifact-reader.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/jsonl",
);

describe("readSystemPromptText", () => {
  it("concatenates every text-typed entry's content from the referenced system-prompt file", async () => {
    const text = await readSystemPromptText(fixturesDir, "system_prompt_0.json");

    expect(text).toContain("You are an expert AI programming assistant");
  });

  it("returns null when the file does not exist", async () => {
    const text = await readSystemPromptText(fixturesDir, "system_prompt_missing.json");

    expect(text).toBeNull();
  });

  it("returns null when the file's content is not the expected shape", async () => {
    const text = await readSystemPromptText(fixturesDir, "system_prompt_malformed.json");

    expect(text).toBeNull();
  });
});

describe("readToolDefinitionNames", () => {
  it("extracts every tool's name from the referenced tools file", async () => {
    const names = await readToolDefinitionNames(fixturesDir, "tools_0.json");

    expect(names).toEqual([
      "create_file",
      "read_file",
      "run_in_terminal",
      "manage_todo_list",
    ]);
  });

  it("returns null when the file does not exist", async () => {
    const names = await readToolDefinitionNames(fixturesDir, "tools_missing.json");

    expect(names).toBeNull();
  });

  it("returns null when the file's content is not valid JSON", async () => {
    const names = await readToolDefinitionNames(fixturesDir, "tools_malformed.json");

    expect(names).toBeNull();
  });
});
