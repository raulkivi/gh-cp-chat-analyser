import type { JsonlEnvelope } from "./main-jsonl-reader.js";

const UNKNOWN_MODEL = "unknown";
const NANO_AIU_PER_AI_CREDIT = 1_000_000_000;

// A single llm_request span's usage, before it's aggregated with any other
// llm_request spans in the same SQLite turn (session-usage-spans.ts) and
// before the always-unavailable TurnUsage fields (§7 note below) are added.
export interface LlmRequestUsage {
  uncachedInput: number;
  cacheRead: number;
  output: number;
  aiCredits: number | null;
  model: string;
}

// Defensive extractor for `llm_request`-typed spans (architecture.md §7):
// GitHub Copilot Chat's local debug log records `inputTokens` as the total
// input for the request (cached + uncached) and `cachedTokens` as the
// subset of it that was served from cache — there is no separate
// cache-write figure or tool/vision/reasoning breakdown in this event shape.
// Cost is recorded as nano-AIU and normalized here to AI Credits. An older/
// unrecognized shape (missing numeric inputTokens or outputTokens) yields null
// rather than a fabricated usage record.
export function extractLlmRequestUsage(
  envelope: JsonlEnvelope,
): LlmRequestUsage | null {
  if (envelope.type !== "llm_request") {
    return null;
  }

  const attrs = envelope.attrs;
  if (!attrs) {
    return null;
  }

  const { inputTokens, outputTokens, cachedTokens, copilotUsageNanoAiu, model } =
    attrs as Record<string, unknown>;
  if (typeof inputTokens !== "number" || typeof outputTokens !== "number") {
    return null;
  }

  const cacheRead = typeof cachedTokens === "number" ? cachedTokens : 0;
  const aiCredits =
    typeof copilotUsageNanoAiu === "number" &&
    Number.isFinite(copilotUsageNanoAiu) &&
    copilotUsageNanoAiu >= 0
      ? copilotUsageNanoAiu / NANO_AIU_PER_AI_CREDIT
      : null;

  return {
    uncachedInput: Math.max(inputTokens - cacheRead, 0),
    cacheRead,
    output: outputTokens,
    aiCredits,
    model: typeof model === "string" ? model : UNKNOWN_MODEL,
  };
}
