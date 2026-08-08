import { useEffect, useState } from "react";
import type { ConfigWarning, Session } from "@gh-cp-chat-analyser/domain";
import { fetchConfigStatus } from "./api-client/config-status.js";
import { fetchLearnScenarios } from "./api-client/learn-scenarios.js";
import { fetchSession, fetchSessions } from "./api-client/sessions.js";
import { ConfigWarningBanner } from "./components/ConfigWarningBanner.js";
import { ExplanationPanel } from "./components/ExplanationPanel.js";
import { SystemPromptBreakdown } from "./components/SystemPromptBreakdown.js";
import { TimelineScrubber } from "./components/TimelineScrubber.js";
import { ToolInventoryPanel } from "./components/ToolInventoryPanel.js";
import { TurnDetail } from "./components/TurnDetail.js";
import { TurnsTable } from "./components/TurnsTable.js";
import { useSessionStore } from "./state/session-store.js";

interface HealthResponse {
  status: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scenarios, setScenarios] = useState<Session[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);
  const { session, selectedTurnIndex, loadSession, selectTurn } = useSessionStore();

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth);
  }, []);

  useEffect(() => {
    fetchLearnScenarios().then(setScenarios);
  }, []);

  useEffect(() => {
    fetchSessions().then(setSessions);
  }, []);

  useEffect(() => {
    fetchConfigStatus().then((status) => setConfigWarnings(status.warnings));
  }, []);

  const selectedTurn = session?.turns[selectedTurnIndex] ?? null;

  return (
    <main>
      <ConfigWarningBanner warnings={configWarnings} />
      <h1>GitHub Copilot Chat Session Analyser</h1>
      <p>{health ? `status: ${health.status}` : "Checking server…"}</p>

      <section>
        <h2>Learn mode</h2>
        <ul>
          {scenarios.map((scenario) => (
            <li key={scenario.id}>
              <button type="button" onClick={() => loadSession(scenario)}>
                {scenario.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Analyze mode</h2>
        <ul>
          {sessions.map((analyzeSession) => (
            <li key={analyzeSession.id}>
              <button type="button" onClick={() => fetchSession(analyzeSession.id).then(loadSession)}>
                {analyzeSession.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {session && (
        <section>
          <TurnsTable
            turns={session.turns}
            selectedTurnIndex={selectedTurnIndex}
            onSelectTurn={selectTurn}
          />
          <ExplanationPanel turn={selectedTurn} />
          <TimelineScrubber
            turnCount={session.turns.length}
            selectedTurnIndex={selectedTurnIndex}
            onSelectTurn={selectTurn}
          />
          {session.mode === "analyze" && (
            <>
              <TurnDetail turn={selectedTurn} />
              <SystemPromptBreakdown components={session.systemPrompt ?? []} />
              <ToolInventoryPanel entries={session.toolInventory ?? []} />
            </>
          )}
        </section>
      )}
    </main>
  );
}
