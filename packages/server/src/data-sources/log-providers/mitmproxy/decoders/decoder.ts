import type { ToolCallRecord, TurnUsage } from "@gh-cp-chat-analyser/domain";

// mitmproxy-only shapes — never imported outside data-sources/log-providers
// /mitmproxy (phase-9-log-providers-implementation.md §7/§10). Header/body
// values are already redacted (redact-headers.ts) by the time a decoder
// sees them. responseMimeType is carried alongside the doc's original
// fields specifically so SSE detection (§5) doesn't have to re-derive it
// from response headers a second time.
export interface RawMitmExchange {
  requestHeaders: Record<string, string>;
  requestBody: string;
  responseHeaders: Record<string, string>;
  responseBody: string;
  responseMimeType: string;
  timestamp: string;
}

export interface NormalizedExchange {
  usage: TurnUsage;
  toolCalls: ToolCallRecord[];
}

export interface MitmExchangeDecoder {
  readonly vendorId: "anthropic" | "openai";
  recognizes(exchange: RawMitmExchange): boolean;
  decode(exchange: RawMitmExchange): NormalizedExchange;
}
