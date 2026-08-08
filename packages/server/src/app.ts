import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import express, { type Express } from "express";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { getLearnScenario, listLearnScenarios } from "./data-sources/learn-scenarios/loader.js";
import { resolveSessionStoreDbPath } from "./data-sources/sqlite/session-store-path.js";
import {
  getCheckpointRows,
  getSessionFileRows,
  getSessionRow,
  getTurnRows,
  listSessionRows,
  openReadOnlyDb,
} from "./data-sources/sqlite/session-store.js";
import { buildSession, buildSessionSummary } from "./services/session-enricher/session-enricher.js";

export interface CreateAppOptions {
  sessionStoreDbPath?: string;
}

export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const resolvedDbPath = options.sessionStoreDbPath ?? resolveSessionStoreDbPath();

  function openSessionStoreDb(): DatabaseSync | null {
    if (!resolvedDbPath || !existsSync(resolvedDbPath)) {
      return null;
    }
    return openReadOnlyDb(resolvedDbPath);
  }

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/learn/scenarios", (_req, res) => {
    res.json(listLearnScenarios());
  });

  app.get("/api/learn/scenarios/:id", (req, res) => {
    const scenario = getLearnScenario(req.params.id);
    if (!scenario) {
      res.status(404).json({ error: `Unknown learn scenario id "${req.params.id}"` });
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

  app.get("/api/sessions/:id", (req, res) => {
    const db = openSessionStoreDb();
    if (!db) {
      res.status(404).json({ error: `Unknown session id "${req.params.id}"` });
      return;
    }

    try {
      const sessionRow = getSessionRow(db, req.params.id);
      if (!sessionRow) {
        res.status(404).json({ error: `Unknown session id "${req.params.id}"` });
        return;
      }

      const turnRows = getTurnRows(db, sessionRow.id);
      const fileRows = getSessionFileRows(db, sessionRow.id);
      const checkpointRows = getCheckpointRows(db, sessionRow.id);
      res.json(buildSession(sessionRow, turnRows, fileRows, checkpointRows));
    } finally {
      db.close();
    }
  });

  return app;
}
