import { existsSync, readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import express, { type Express } from "express";
import type {
  Session,
  SystemPromptComponent,
  ToolInventoryEntry,
  TurnUsage,
} from "@gh-cp-chat-analyser/domain";
import {
  getLearnScenario,
  listLearnScenarios,
} from "./data-sources/learn-scenarios/loader.js";
import {
  classifyEnvelopesAvailability,
  readMainJsonlFile,
  type MainJsonlAvailability,
} from "./data-sources/jsonl/main-jsonl-reader.js";
import {
  listWorkspaceDebugLogsDirPaths,
  resolveMainJsonlPath,
} from "./data-sources/jsonl/session-log-path.js";
import {
  collectResponseIds,
  extractTurnUsages,
} from "./data-sources/jsonl/session-usage-spans.js";
import { resolveSessionStoreDbPath } from "./data-sources/sqlite/session-store-path.js";
import { resolveAgentTracesDbPath } from "./data-sources/agent-traces/agent-traces-db-path.js";
import { loadAgentTraceUsageForResponseIds } from "./data-sources/agent-traces/agent-traces-reader.js";
import {
  getSessionFileRows,
  getSessionRow,
  getTurnRows,
  listSessionRows,
  openReadOnlyDb,
} from "./data-sources/sqlite/session-store.js";
import { resolveVscodeSettingsPath } from "./data-sources/vscode-settings/vscode-settings-path.js";
import {
  buildSession,
  buildSessionSummary,
} from "./services/session-enricher/session-enricher.js";
import { buildAnalyzeModeExtras } from "./services/session-enricher/analyze-mode-extras.js";
import { checkConfig } from "./services/config-check/config-check.js";

const APP_VERSION = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
  ) as { version: string }
).version;

export interface CreateAppOptions {
  sessionStoreDbPath?: string;
  debugLogsDirPaths?: string[];
  vscodeSettingsPath?: string | null;
  agentTracesDbPath?: string | null;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const resolvedDbPath =
    options.sessionStoreDbPath ?? resolveSessionStoreDbPath();
  const resolvedDebugLogsDirPaths =
    options.debugLogsDirPaths ?? listWorkspaceDebugLogsDirPaths();
  const resolvedVscodeSettingsPath =
    options.vscodeSettingsPath !== undefined
      ? options.vscodeSettingsPath
      : resolveVscodeSettingsPath();
  const resolvedAgentTracesDbPath =
    options.agentTracesDbPath !== undefined
      ? options.agentTracesDbPath
      : resolveAgentTracesDbPath();

  function openSessionStoreDb(): DatabaseSync | null {
    if (!resolvedDbPath || !existsSync(resolvedDbPath)) {
      return null;
    }
    return openReadOnlyDb(resolvedDbPath);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: APP_VERSION });
  });

  app.get("/api/config/status", (_req, res) => {
    res.json(checkConfig({ settingsPath: resolvedVscodeSettingsPath }));
  });

  app.get("/api/learn/scenarios", (_req, res) => {
    res.json(listLearnScenarios());
  });

  app.get("/api/learn/scenarios/:id", (req, res) => {
    const scenario = getLearnScenario(req.params.id);
    if (!scenario) {
      res
        .status(404)
        .json({ error: `Unknown learn scenario id "${req.params.id}"` });
      return;
    }
    res.json(scenario);
  });

  app.get("/api/sessions", (_req, res) => {
    const db = openSessionStoreDb();
    if (!db) {
      res.json([]);
      return;
    }

    try {
      const summaries: Session[] = listSessionRows(db).map(buildSessionSummary);
      res.json(summaries);
    } finally {
      db.close();
    }
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const db = openSessionStoreDb();
    if (!db) {
      res.status(404).json({ error: `Unknown session id "${req.params.id}"` });
      return;
    }

    try {
      const sessionRow = getSessionRow(db, req.params.id);
      if (!sessionRow) {
        res
          .status(404)
          .json({ error: `Unknown session id "${req.params.id}"` });
        return;
      }

      const turnRows = getTurnRows(db, sessionRow.id);
      const fileRows = getSessionFileRows(db, sessionRow.id);
      const mainJsonlPath = resolveMainJsonlPath(
        resolvedDebugLogsDirPaths,
        sessionRow.id,
      );

      let mainJsonlAvailability: MainJsonlAvailability = "missing";
      let turnUsages: (TurnUsage | null)[] = [];
      let invokedToolNamesByTurn: string[][] = [];
      let systemPrompt: SystemPromptComponent[] = [];
      let toolInventory: ToolInventoryEntry[] = [];
      if (mainJsonlPath) {
        const { envelopes, rawLineCount } = await readMainJsonlFile(mainJsonlPath);
        mainJsonlAvailability = classifyEnvelopesAvailability(
          envelopes,
          rawLineCount,
        );
        if (mainJsonlAvailability === "events-present") {
          const agentTraceUsageByResponseId = loadAgentTraceUsageForResponseIds(
            resolvedAgentTracesDbPath,
            collectResponseIds(envelopes),
          );
          turnUsages = extractTurnUsages(envelopes, agentTraceUsageByResponseId);
          ({ invokedToolNamesByTurn, systemPrompt, toolInventory } =
            await buildAnalyzeModeExtras(envelopes, mainJsonlPath));
        }
      }

      res.json(
        buildSession({
          sessionRow,
          turnRows,
          fileRows,
          mainJsonlAvailability,
          turnUsages,
          invokedToolNamesByTurn,
          systemPrompt,
          toolInventory,
        }),
      );
    } catch (error) {
      res.status(500).json({
        error: `Failed to load session "${req.params.id}": ${(error as Error).message}`,
      });
    } finally {
      db.close();
    }
  });

  return app;
}
