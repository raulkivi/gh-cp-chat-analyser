import { useEffect, useState } from "react";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { fetchLearnScenarios } from "./api-client/learn-scenarios.js";
import { ExplanationPanel } from "./components/ExplanationPanel.js";
import { TimelineScrubber } from "./components/TimelineScrubber.js";
import { TurnsTable } from "./components/TurnsTable.js";
import { useSessionStore } from "./state/session-store.js";

interface HealthResponse {
  status: string;
}

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scenarios, setScenarios] = useState<Session[]>([]);
  const { session, selectedTurnIndex, loadSession, selectTurn } = useSessionStore();

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth);
  }, []);

  useEffect(() => {
    fetchLearnScenarios().then(setScenarios);
  }, []);

  const selectedTurn = session?.turns[selectedTurnIndex] ?? null;

  return (
    <main>
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
        </section>
      )}
    </main>
  );
}
