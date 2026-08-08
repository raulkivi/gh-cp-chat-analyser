import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readMainJsonlEnvelopes } from "./main-jsonl-reader.js";
import type { JsonlEnvelope } from "./main-jsonl-reader.js";
import {
  COST_NOT_AVAILABLE_REASON,
  extractTurnUsages,
  groupEnvelopesByUserMessage,
  USAGE_CATEGORY_NOT_EXPOSED_REASON,
} from "./session-usage-spans.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/jsonl",
);
const realSessionPath = path.join(fixturesDir, "real-session-with-usage.jsonl");

describe("groupEnvelopesByUserMessage", () => {
  it("starts a new group at each user_message event", async () => {
    const envelopes = await readMainJsonlEnvelopes(realSessionPath);

    const groups = groupEnvelopesByUserMessage(envelopes);

    expect(groups).toHaveLength(2);
    expect(groups[0][0].type).toBe("user_message");
    expect(groups[0].every((e) => e.spanId !== "0000000000000015")).toBe(true);
    expect(groups[1][0].spanId).toBe("0000000000000015");
  });

  it("returns an empty array when there is no user_message event", () => {
    const envelopes: JsonlEnvelope[] = [
      { type: "session_start" },
      { type: "discovery" },
    ];

    expect(groupEnvelopesByUserMessage(envelopes)).toEqual([]);
  });
});

describe("extractTurnUsages", () => {
  it("sums every llm_request span within a turn's group (real fixture, 2 requests per turn)", async () => {
    const envelopes = await readMainJsonlEnvelopes(realSessionPath);

    const [turn0, turn1] = extractTurnUsages(envelopes);

    expect(turn0).toEqual({
      uncachedInput: { known: true, value: 21370 },
      cacheWrite: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      cacheRead: { known: true, value: 42559 },
      tool: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      vision: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      reasoning: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      output: { known: true, value: 1146 },
      costUsd: { known: false, reason: COST_NOT_AVAILABLE_REASON },
      model: "claude-sonnet-5",
    });
    expect(turn1).toEqual({
      uncachedInput: { known: true, value: 1835 },
      cacheWrite: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      cacheRead: { known: true, value: 70461 },
      tool: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      vision: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      reasoning: { known: false, reason: USAGE_CATEGORY_NOT_EXPOSED_REASON },
      output: { known: true, value: 440 },
      costUsd: { known: false, reason: COST_NOT_AVAILABLE_REASON },
      model: "claude-sonnet-5",
    });
  });

  it("returns null for a turn whose group has no usable llm_request span", () => {
    const envelopes: JsonlEnvelope[] = [
      { type: "user_message", spanId: "u1" },
      { type: "tool_call", spanId: "t1" },
    ];

    expect(extractTurnUsages(envelopes)).toEqual([null]);
  });

  it("returns null for a turn whose only llm_request span has an older/unknown attrs shape", () => {
    const envelopes: JsonlEnvelope[] = [
      { type: "user_message", spanId: "u1" },
      { type: "llm_request", spanId: "r1", attrs: { foo: "bar" } },
    ];

    expect(extractTurnUsages(envelopes)).toEqual([null]);
  });

  it("returns an empty array when there is no user_message event", () => {
    expect(extractTurnUsages([{ type: "session_start" }])).toEqual([]);
  });

  it("prefers the latest request with a known model over a later request missing attrs.model", () => {
    const envelopes: JsonlEnvelope[] = [
      { type: "user_message", spanId: "u1" },
      {
        type: "llm_request",
        spanId: "r1",
        attrs: {
          model: "claude-sonnet-5",
          inputTokens: 100,
          outputTokens: 10,
          cachedTokens: 0,
        },
      },
      {
        type: "llm_request",
        spanId: "r2",
        attrs: { inputTokens: 50, outputTokens: 5, cachedTokens: 0 },
      },
    ];

    const [turn0] = extractTurnUsages(envelopes);

    expect(turn0?.model).toBe("claude-sonnet-5");
  });

  it("falls back to 'unknown' only when none of the turn's requests have a known model", () => {
    const envelopes: JsonlEnvelope[] = [
      { type: "user_message", spanId: "u1" },
      {
        type: "llm_request",
        spanId: "r1",
        attrs: { inputTokens: 100, outputTokens: 10, cachedTokens: 0 },
      },
      {
        type: "llm_request",
        spanId: "r2",
        attrs: { inputTokens: 50, outputTokens: 5, cachedTokens: 0 },
      },
    ];

    const [turn0] = extractTurnUsages(envelopes);

    expect(turn0?.model).toBe("unknown");
  });
});
