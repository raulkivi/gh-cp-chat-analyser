import { describe, expect, it } from "vitest";
import { toolCallRecordSchema } from "./tool-call-record.js";

describe("toolCallRecordSchema", () => {
  it("accepts a minimal tool call (Learn mode)", () => {
    const sample = { name: "read_file", argsSummary: "read package.json" };

    expect(toolCallRecordSchema.parse(sample)).toEqual(sample);
  });

  it("accepts a full tool call with Analyze-mode-only fields", () => {
    const sample = {
      name: "read_file",
      argsSummary: "read package.json",
      filesTouched: ["package.json"],
      tokenCount: { known: true, value: 12 },
    };

    expect(toolCallRecordSchema.parse(sample)).toEqual(sample);
  });

  it("rejects a tool call missing argsSummary", () => {
    expect(() => toolCallRecordSchema.parse({ name: "read_file" })).toThrow();
  });
});
