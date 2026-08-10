import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Session, TokenCount, Turn, TurnInspectorDetail, TurnUsage } from "@gh-cp-chat-analyser/domain";
import { unavailableTokenCount } from "@gh-cp-chat-analyser/domain";
import type { LogProvider, LogProviderAvailability } from "../log-provider.js";
import { buildContentPart } from "../build-content-parts.js";
import { harEntryToRawExchange, readHarFile } from "./har.js";
import { decodeExchange } from "./decoders/registry.js";
import type { MitmExchangeDecoder } from "./decoders/decoder.js";
import { computeHarSessionId } from "./session-id.js";

const PROVIDER_ID = "mitmproxy";
const NO_AI_CREDITS_REASON =
  "AI Credits are GitHub Copilot's own billing unit — a mitmproxy-captured direct vendor API session has no AI Credits conversion.";

export interface MitmproxyLogProviderOptions {
  capturesDirPath: string | null;
  decoders?: MitmExchangeDecoder[];
}

function reasonOf(tokenCount: TokenCount): string {
  return tokenCount.known ? "" : tokenCount.reason;
}

function buildExchangeExplanation(usage: TurnUsage): string {
  if (usage.uncachedInput.known && usage.output.known) {
    return (
      `This exchange sent ${usage.uncachedInput.value.toLocaleString()} input token(s) and ` +
      `produced ${usage.output.value.toLocaleString()} output token(s) using ${usage.model}.`
    );
  }
  return reasonOf(usage.uncachedInput) || reasonOf(usage.output) || "Usage data is unavailable for this exchange.";
}

// Adapts a local mitmproxy HAR capture into the LogProvider contract
// (architecture.md §6.2.3): one configured captures directory, one session
// per .har file in it, each
// HAR entry decoded through the vendor decoder registry after credential
// redaction (har.ts/redact-headers.ts).
export class MitmproxyLogProvider implements LogProvider {
  readonly id = PROVIDER_ID;
  readonly label = "mitmproxy (HAR capture)";

  constructor(private readonly options: MitmproxyLogProviderOptions) {}

  private listHarFiles(): string[] {
    const dir = this.options.capturesDirPath;
    if (!dir || !existsSync(dir)) {
      return [];
    }
    return readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith(".har"))
      .map((name) => path.join(dir, name))
      .sort();
  }

  async checkAvailability(): Promise<LogProviderAvailability> {
    const dir = this.options.capturesDirPath;
    if (!dir) {
      return {
        available: false,
        unavailableReason: "No mitmproxy captures directory is configured.",
      };
    }
    if (!existsSync(dir)) {
      return {
        available: false,
        unavailableReason: `Configured mitmproxy captures directory "${dir}" does not exist.`,
      };
    }
    if (this.listHarFiles().length === 0) {
      return {
        available: false,
        unavailableReason: `No .har files found in "${dir}". Export a HAR capture from mitmproxy (mitmdump --set hardump=...) and place it there.`,
      };
    }
    return { available: true };
  }

  private buildSessionFromFile(filePath: string): Session {
    const id = computeHarSessionId(filePath);
    const har = readHarFile(filePath);
    const decoders = this.options.decoders ?? [];

    const turns: Turn[] = har.log.entries.map((entry, index) => {
      const exchange = harEntryToRawExchange(entry);
      const normalized = decodeExchange(exchange, decoders);
      return {
        index,
        userMessage: "",
        assistantResponse: "",
        toolCalls: normalized.toolCalls,
        usage: normalized.usage,
        explanation: buildExchangeExplanation(normalized.usage),
      };
    });

    const knownUsageTurns = turns.filter((turn) => turn.usage.output.known);
    const model =
      knownUsageTurns.length > 0
        ? knownUsageTurns[knownUsageTurns.length - 1].usage.model
        : "unknown";
    const startedAt = har.log.entries[0]?.startedDateTime;

    return {
      id,
      mode: "analyze",
      providerId: PROVIDER_ID,
      title: path.basename(filePath),
      model,
      turns,
      turnCount: turns.length,
      costAiCredits: unavailableTokenCount(NO_AI_CREDITS_REASON),
      usageDataAvailable: knownUsageTurns.length > 0,
      ...(startedAt ? { startedAt } : {}),
    };
  }

  async listSessions(): Promise<Session[]> {
    return this.listHarFiles().map((file) => ({
      ...this.buildSessionFromFile(file),
      turns: [],
    }));
  }

  async readSession(sessionId: string): Promise<Session | null> {
    const file = this.listHarFiles().find((candidate) => computeHarSessionId(candidate) === sessionId);
    if (!file) {
      return null;
    }
    return this.buildSessionFromFile(file);
  }

  // A HAR entry is already a complete, self-contained request/response pair
  // — unlike main.jsonl there's no cross-request inputMessages-growth
  // invariant a capture is guaranteed to
  // follow, so this returns exactly one round with the full raw bodies as
  // text/placeholder parts, bypassing the MitmExchangeDecoder registry
  // entirely (decoders normalize usage, discarding message content, which
  // is exactly what this feature needs back).
  async readTurnDetail(sessionId: string, turnIndex: number): Promise<TurnInspectorDetail | null> {
    const file = this.listHarFiles().find((candidate) => computeHarSessionId(candidate) === sessionId);
    if (!file) {
      return null;
    }

    const har = readHarFile(file);
    const entry = har.log.entries[turnIndex];
    if (!entry) {
      return null;
    }

    const exchange = harEntryToRawExchange(entry);
    return {
      turnIndex,
      userMessage: [],
      rounds: [
        {
          request: {
            index: 0,
            addedMessages: [buildContentPart(exchange.requestBody)],
            toolCalls: [],
          },
          response: {
            index: 0,
            response: [buildContentPart(exchange.responseBody)],
          },
        },
      ],
    };
  }
}
