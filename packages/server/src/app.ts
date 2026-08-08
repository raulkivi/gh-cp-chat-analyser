import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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
  type JsonlEnvelope,
  type MainJsonlAvailability,
} from "./data-sources/jsonl/main-jsonl-reader.js";
import {
  listWorkspaceDebugLogsDirPaths,
  resolveMainJsonlPath,
} from "./data-sources/jsonl/session-log-path.js";
import {
  readSystemPromptText,
  readToolDefinitionNames,
} from "./data-sources/jsonl/prompt-artifact-reader.js";
import { buildSystemPromptBreakdown } from "./data-sources/jsonl/system-prompt-breakdown.js";
import { extractTurnUsages } from "./data-sources/jsonl/session-usage-spans.js";
import {
  buildToolInventory,
  extractInvokedToolNamesByTurn,
} from "./data-sources/jsonl/tool-inventory.js";
import { resolveSessionStoreDbPath } from "./data-sources/sqlite/session-store-path.js";
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
import { checkConfig } from "./services/config-check/config-check.js";

const APP_VERSION = (
  JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf-8"),
  ) as { version: string }
).version;

interface AnalyzeModeExtras {
  invokedToolNamesByTurn: string[][];
  systemPrompt: SystemPromptComponent[];
  toolInventory: ToolInventoryEntry[];
}

// Phase 6: system-prompt/tool-inventory detail is only derivable from the
// systemPromptFile/toolsFile named on an llm_request span (architecture.md
// §6.2 Phase 6 note) — the last such span is used, mirroring the existing
// "last known turn's model" precedent in session-enricher.ts. When no
// llm_request span carries those fields (older/unknown shape), the
// tool-inventory still degrades to invoked-only entries rather than being
// dropped entirely.
async function buildAnalyzeModeExtras(
  envelopes: JsonlEnvelope[],
  mainJsonlPath: string,
): Promise<AnalyzeModeExtras> {
  const invokedToolNamesByTurn = extractInvokedToolNamesByTurn(envelopes);

  const artifactSource = [...envelopes].reverse().find(
    (envelope): envelope is JsonlEnvelope & {
      attrs: { systemPromptFile: string; toolsFile: string };
    } =>
      envelope.type === "llm_request" &&
      typeof envelope.attrs?.systemPromptFile === "string" &&
      typeof envelope.attrs?.toolsFile === "string",
  );

  if (!artifactSource) {
    return {
      invokedToolNamesByTurn,
      systemPrompt: buildSystemPromptBreakdown(envelopes, null, null),
      toolInventory: buildToolInventory(null, invokedToolNamesByTurn),
    };
  }

  const sessionLogDir = path.dirname(mainJsonlPath);
  const [systemPromptText, loadedToolNames] = await Promise.all([
    readSystemPromptText(sessionLogDir, artifactSource.attrs.systemPromptFile),
    readToolDefinitionNames(sessionLogDir, artifactSource.attrs.toolsFile),
  ]);

  return {
    invokedToolNamesByTurn,
    systemPrompt: buildSystemPromptBreakdown(
      envelopes,
      systemPromptText,
      loadedToolNames?.length ?? null,
    ),
    toolInventory: buildToolInventory(loadedToolNames, invokedToolNamesByTurn),
  };
}

export interface CreateAppOptions {
  sessionStoreDbPath?: string;
  debugLogsDirPaths?: string[];
  vscodeSettingsPath?: string | null;
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
          turnUsages = extractTurnUsages(envelopes);
          ({ invokedToolNamesByTurn, systemPrompt, toolInventory } =
            await buildAnalyzeModeExtras(envelopes, mainJsonlPath));
        }
      }

      res.json(
        buildSession(
          sessionRow,
          turnRows,
          fileRows,
          mainJsonlAvailability,
          turnUsages,
          invokedToolNamesByTurn,
          systemPrompt,
          toolInventory,
        ),
      );
    } finally {
      db.close();
    }
  });

  return app;
}
