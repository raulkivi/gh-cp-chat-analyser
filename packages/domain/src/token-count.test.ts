import { describe, expect, it } from "vitest";
import { tokenCountSchema } from "./token-count.js";

describe("tokenCountSchema", () => {
  it("accepts a known token count", () => {
    const sample = { known: true, value: 42 };

    expect(tokenCountSchema.parse(sample)).toEqual(sample);
  });

  it("accepts an unknown token count with a reason", () => {
    const sample = { known: false, reason: "main.jsonl parsing not yet implemented" };

    expect(tokenCountSchema.parse(sample)).toEqual(sample);
  });

  it("rejects a known token count missing a value", () => {
    expect(() => tokenCountSchema.parse({ known: true })).toThrow();
  });

  it("rejects an unknown token count missing a reason", () => {
    expect(() => tokenCountSchema.parse({ known: false })).toThrow();
  });
});
