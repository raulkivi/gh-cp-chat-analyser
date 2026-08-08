import express, { type Express } from "express";
import { getLearnScenario, listLearnScenarios } from "./data-sources/learn-scenarios/loader.js";

export function createApp(): Express {
  const app = express();

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

  return app;
}
