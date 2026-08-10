import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type { Session, SystemPromptComponent, ToolInventoryEntry, TurnUsage } from "@gh-cp-chat-analyser/domain";
import {
  classifyEnvelopesAvailability,
  readMainJsonlFile,
  type MainJsonlAvailability,
} from "../../jsonl/main-jsonl-reader.js";
import { resolveMainJsonlPath } from "../../jsonl/session-log-path.js";
import {
  collectResponseIds,
  extractTurnUsages,
} from "../../jsonl/session-usage-spans.js";
import { loadAgentTraceUsageForResponseIds } from "../../agent-traces/agent-traces-reader.js";
import {
  getSessionFileRows,
  getSessionRow,
  getTurnRows,
  listSessionRows,
  openReadOnlyDb,
  type SessionRow,
} from "../../sqlite/session-store.js";
import {
  buildAnalyzeModeExtras,
} from "../../../services/session-enricher/analyze-mode-extras.js";
import {
  buildSession,
  buildSessionSummary,
  computeSessionCost,
} from "../../../services/session-enricher/session-enricher.js";
import type { LogProvider, LogProviderAvailability } from "../log-provider.js";

export interface VscodeLogProviderOptions {
  sessionStoreDbPath: string | null;
  debugLogsDirPaths: string[];
  agentTracesDbPath: string | null;
}

const PROVIDER_ID = "vscode";

// Adapts the existing SQLite session store + main.jsonl parsing +
// session-enricher (Phases 3-6) and the optional agent-traces.db enrichment
// (Phase 8.5) behind the LogProvider contract. This is a refactor of that
// existing, already-tested code — app.ts's route handlers used to call
// these same modules directly; now they go through this adapter instead, so
// that adding a second provider (mitmproxy) doesn't require touching the
// route layer (architecture.md §6.2.1/§4.1's Phase 9 row, and the
// 2026-08-10 decision to fold Phase 8.5's agent-traces.db read in here
// rather than leaving it as a parallel app.ts-level path).
export class VscodeLogProvider implements LogProvider {
  readonly id = PROVIDER_ID;
  readonly label = "VS Code (local Copilot Chat)";

  constructor(private readonly options: VscodeLogProviderOptions) {}

  private openDb(): DatabaseSync | null {
    const { sessionStoreDbPath } = this.options;
    if (!sessionStoreDbPath || !existsSync(sessionStoreDbPath)) {
      return null;
    }
    return openReadOnlyDb(sessionStoreDbPath);
  }

  async checkAvailability(): Promise<LogProviderAvailability> {
    const db = this.openDb();
    if (!db) {
      return {
        available: false,
        unavailableReason:
          "No local GitHub Copilot Chat session store was found on this machine.",
      };
    }
    db.close();
    return { available: true };
  }

  // costAiCredits per session requires reading each session's main.jsonl (the
  // only source of AI Credits numbers) — an accurate list is worth an extra
  // file read per session for a local tool with a bounded session count. A
  // single session's read failing (corrupt/missing file) degrades that
  // session's cost to unavailable rather than failing the whole list.
  private async summarizeSessionWithCost(row: SessionRow): Promise<Session> {
    try {
      const mainJsonlPath = resolveMainJsonlPath(this.options.debugLogsDirPaths, row.id);
      let mainJsonlAvailability: MainJsonlAvailability = "missing";
      let turnUsages: (TurnUsage | null)[] = [];
      if (mainJsonlPath) {
        const { envelopes, rawLineCount } = await readMainJsonlFile(mainJsonlPath);
        mainJsonlAvailability = classifyEnvelopesAvailability(envelopes, rawLineCount);
        if (mainJsonlAvailability === "events-present") {
          turnUsages = extractTurnUsages(envelopes);
        }
      }
      return {
        ...buildSessionSummary(row, computeSessionCost(mainJsonlAvailability, turnUsages)),
        providerId: PROVIDER_ID,
      };
    } catch {
      return { ...buildSessionSummary(row), providerId: PROVIDER_ID };
    }
  }

  async listSessions(): Promise<Session[]> {
    const db = this.openDb();
    if (!db) {
      return [];
    }
    try {
      const rows = listSessionRows(db);
      return await Promise.all(rows.map((row) => this.summarizeSessionWithCost(row)));
    } finally {
      db.close();
    }
  }

  async readSession(sessionId: string): Promise<Session | null> {
    const db = this.openDb();
    if (!db) {
      return null;
    }

    try {
      const sessionRow = getSessionRow(db, sessionId);
      if (!sessionRow) {
        return null;
      }

      const turnRows = getTurnRows(db, sessionRow.id);
      const fileRows = getSessionFileRows(db, sessionRow.id);
      const mainJsonlPath = resolveMainJsonlPath(this.options.debugLogsDirPaths, sessionRow.id);

      let mainJsonlAvailability: MainJsonlAvailability = "missing";
      let turnUsages: (TurnUsage | null)[] = [];
      let invokedToolNamesByTurn: string[][] = [];
      let systemPrompt: SystemPromptComponent[] = [];
      let toolInventory: ToolInventoryEntry[] = [];
      if (mainJsonlPath) {
        const { envelopes, rawLineCount } = await readMainJsonlFile(mainJsonlPath);
        mainJsonlAvailability = classifyEnvelopesAvailability(envelopes, rawLineCount);
        if (mainJsonlAvailability === "events-present") {
          const agentTraceUsageByResponseId = loadAgentTraceUsageForResponseIds(
            this.options.agentTracesDbPath,
            collectResponseIds(envelopes),
          );
          turnUsages = extractTurnUsages(envelopes, agentTraceUsageByResponseId);
          ({ invokedToolNamesByTurn, systemPrompt, toolInventory } =
            await buildAnalyzeModeExtras(envelopes, mainJsonlPath));
        }
      }

      return {
        ...buildSession({
          sessionRow,
          turnRows,
          fileRows,
          mainJsonlAvailability,
          turnUsages,
          invokedToolNamesByTurn,
          systemPrompt,
          toolInventory,
        }),
        providerId: PROVIDER_ID,
      };
    } finally {
      db.close();
    }
  }
}
