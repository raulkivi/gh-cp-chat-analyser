import express, { type Express } from "express";
import { DOMAIN_PACKAGE_READY } from "@gh-cp-chat-analyser/domain";

export function createApp(): Express {
  const app = express();

  app.get("/api/health", (_req, res) => {
    res.json({ status: DOMAIN_PACKAGE_READY ? "ok" : "degraded" });
  });

  return app;
}
