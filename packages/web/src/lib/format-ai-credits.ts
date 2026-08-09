import type { TokenCount } from "@gh-cp-chat-analyser/domain";

export function formatAiCredits(tokenCount: TokenCount): string {
  return tokenCount.known ? tokenCount.value.toFixed(2) : "—";
}
