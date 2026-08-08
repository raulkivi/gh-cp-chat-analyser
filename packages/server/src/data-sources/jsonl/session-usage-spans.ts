import type { TokenCount, TurnUsage } from "@gh-cp-chat-analyser/domain";
import type { JsonlEnvelope } from "./main-jsonl-reader.js";
import { extractLlmRequestUsage } from "./llm-request-extractor.js";

export const USAGE_CATEGORY_NOT_EXPOSED_REASON =
  "GitHub Copilot Chat's local debug log (main.jsonl) does not expose this token " +
  "category for llm_request spans — only uncached input, cache-read, and output " +
  "tokens are recorded per request.";
export const COST_NOT_AVAILABLE_REASON =
  "Cost in USD is not available: GitHub Copilot Chat's local debug log only " +
  "records an internal usage unit (copilotUsageNanoAiu) per request, not a " +
  "documented USD conversion.";

function unavailable(reason: string): TokenCount {
  return { known: false, reason };
}

// A SQLite `turns` row (one user message -> tool calls -> final assistant
// response) can correspond to several internal `llm_request` spans when the
// agent loops through multiple tool-call round-trips before answering — the
// per-request `turnId` in main.jsonl resets to 0 at every `user_message`
// rather than tracking the SQLite turn index. So the join key (architecture
// §6.2) is positional: the Nth user_message event in the log corresponds to
// SQLite turn_index N, and everything up to (not including) the next
// user_message belongs to that same turn.
export function groupEnvelopesByUserMessage(
  envelopes: JsonlEnvelope[],
): JsonlEnvelope[][] {
  const groups: JsonlEnvelope[][] = [];
  let current: JsonlEnvelope[] | null = null;

  for (const envelope of envelopes) {
    if (envelope.type === "user_message") {
      current = [];
      groups.push(current);
    }
    current?.push(envelope);
  }

  return groups;
}

// Produces one TurnUsage per SQLite turn_index (array position = turn_index),
// or null where the group's llm_request span(s) didn't yield usable numbers
// (constraint 6: the caller falls back to an explicit "unavailable" reason
// rather than this module fabricating one).
export function extractTurnUsages(
  envelopes: JsonlEnvelope[],
): (TurnUsage | null)[] {
  const groups = groupEnvelopesByUserMessage(envelopes);

  return groups.map((group) => {
    const requests = group
      .map(extractLlmRequestUsage)
      .filter((usage) => usage !== null);

    if (requests.length === 0) {
      return null;
    }

    const uncachedInput = requests.reduce((sum, r) => sum + r.uncachedInput, 0);
    const cacheRead = requests.reduce((sum, r) => sum + r.cacheRead, 0);
    const output = requests.reduce((sum, r) => sum + r.output, 0);
    const model = requests[requests.length - 1].model;

    return {
      uncachedInput: { known: true, value: uncachedInput },
      cacheWrite: unavailable(USAGE_CATEGORY_NOT_EXPOSED_REASON),
      cacheRead: { known: true, value: cacheRead },
      tool: unavailable(USAGE_CATEGORY_NOT_EXPOSED_REASON),
      vision: unavailable(USAGE_CATEGORY_NOT_EXPOSED_REASON),
      reasoning: unavailable(USAGE_CATEGORY_NOT_EXPOSED_REASON),
      output: { known: true, value: output },
      costUsd: unavailable(COST_NOT_AVAILABLE_REASON),
      model,
    };
  });
}
