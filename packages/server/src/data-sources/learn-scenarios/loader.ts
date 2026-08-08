import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sessionSchema, type Session } from "@gh-cp-chat-analyser/domain";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/learn-scenarios",
);

function loadScenarios(): Map<string, Session> {
  const scenarios = new Map<string, Session>();
  const files = readdirSync(fixturesDir).filter((file) => file.endsWith(".json"));

  for (const file of files) {
    const raw: unknown = JSON.parse(readFileSync(path.join(fixturesDir, file), "utf-8"));
    // Fail fast: an invalid bundled fixture must break startup, not serve bad data.
    const scenario = sessionSchema.parse(raw);

    if (scenario.mode !== "learn") {
      throw new Error(`Learn scenario fixture "${file}" must have mode "learn"`);
    }
    if (scenarios.has(scenario.id)) {
      throw new Error(`Duplicate learn scenario id "${scenario.id}" (from "${file}")`);
    }
    scenarios.set(scenario.id, scenario);
  }

  return scenarios;
}

const scenarios = loadScenarios();

export function listLearnScenarios(): Session[] {
  return Array.from(scenarios.values());
}

export function getLearnScenario(id: string): Session | undefined {
  return scenarios.get(id);
}
