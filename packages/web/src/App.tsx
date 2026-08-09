import { useEffect, useRef, useState } from "react";
import type { ConfigWarning, Session } from "@gh-cp-chat-analyser/domain";
import { fetchConfigStatus } from "./api-client/config-status.js";
import { fetchLearnScenarios } from "./api-client/learn-scenarios.js";
import { fetchSession, fetchSessions } from "./api-client/sessions.js";
import { AppHeader } from "./components/AppHeader.js";
import { ConfigWarningBanner } from "./components/ConfigWarningBanner.js";
import { ExplanationPanel } from "./components/ExplanationPanel.js";
import { SessionList } from "./components/SessionList.js";
import { SystemPromptBreakdown } from "./components/SystemPromptBreakdown.js";
import { TimelineScrubber } from "./components/TimelineScrubber.js";
import { ToolInventoryPanel } from "./components/ToolInventoryPanel.js";
import { TurnsTable } from "./components/TurnsTable.js";
import { Blueprint } from "./components/ui/Blueprint.js";
import { SegmentedControl } from "./components/ui/SegmentedControl.js";
import { Tag } from "./components/ui/Tag.js";
import { CostSparkline } from "./charts/CostSparkline.js";
import { useSessionStore } from "./state/session-store.js";

interface HealthResponse {
  status: string;
  version: string;
}

const RIGHT_TAB_OPTIONS = [
  { value: "explanation", label: "Explanation" },
  { value: "system-prompt", label: "System prompt" },
  { value: "tools", label: "Tools" },
] as const;

const EMPTY_STATES = {
  learn: {
    title: "No bundled Learn scenarios found",
    body: "Scenario fixtures ship with the app — if this list is empty, the bundled fixtures failed to load. Check packages/server/fixtures.",
  },
  analyze: {
    title: "No Copilot Chat sessions found yet",
    body: "This reads your local Copilot Chat session store. Run a chat session in VS Code, then reload this page.",
  },
} as const;

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scenarios, setScenarios] = useState<Session[]>([]);
  const [scenariosLoaded, setScenariosLoaded] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [configWarnings, setConfigWarnings] = useState<ConfigWarning[]>([]);
  const [showConfigBanner, setShowConfigBanner] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const { session, selectedTurnIndex, mode, rightTab, loadSession, selectTurn, setMode, setRightTab } =
    useSessionStore();
  const latestSessionRequestId = useRef(0);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((error: Error) => setFetchError(error.message));
  }, []);

  useEffect(() => {
    fetchLearnScenarios()
      .then((result) => {
        setScenarios(result);
        setScenariosLoaded(true);
      })
      .catch((error: Error) => setFetchError(error.message));
  }, []);

  useEffect(() => {
    fetchSessions()
      .then((result) => {
        setSessions(result);
        setSessionsLoaded(true);
      })
      .catch((error: Error) => setFetchError(error.message));
  }, []);

  useEffect(() => {
    fetchConfigStatus()
      .then((status) => setConfigWarnings(status.warnings))
      .catch((error: Error) => setFetchError(error.message));
  }, []);

  const selectedTurn = session?.turns[selectedTurnIndex] ?? null;
  const listForMode = mode === "learn" ? scenarios : sessions;
  const listLoaded = mode === "learn" ? scenariosLoaded : sessionsLoaded;
  const showEmptyState = listLoaded && listForMode.length === 0;
  const allCostsKnown =
    session !== null && session.turns.length > 0 && session.turns.every((turn) => turn.usage.costAiCredits.known);
  // toolInventory only comes from a parsed main.jsonl; a turn's toolCalls
  // come independently from SQLite session_files, so either source having
  // data means tool-call detail is available for the selected turn.
  const toolCallsAvailable =
    (selectedTurn?.toolCalls.length ?? 0) > 0 || (session?.toolInventory?.length ?? 0) > 0;

  function handleSelectSession(picked: Session): void {
    if (mode === "analyze") {
      const requestId = ++latestSessionRequestId.current;
      fetchSession(picked.id)
        .then((result) => {
          // Ignore a response for a session the user has since navigated
          // away from — otherwise a slower earlier request can resolve
          // after a faster later one and overwrite it.
          if (requestId === latestSessionRequestId.current) {
            loadSession(result);
          }
        })
        .catch((error: Error) => {
          if (requestId === latestSessionRequestId.current) {
            setFetchError(error.message);
          }
        });
    } else {
      loadSession(picked);
    }
  }

  return (
    <main>
      <AppHeader
        mode={mode}
        onModeChange={setMode}
        hasConfigWarnings={configWarnings.length > 0}
        onConfigClick={() => setShowConfigBanner(true)}
      />
      <p className="text-muted" style={{ fontSize: 11, margin: "var(--space-2) var(--space-4) 0" }}>
        {health ? `status: ${health.status} · v${health.version}` : "Checking server…"}
      </p>
      {fetchError && (
        <p
          role="alert"
          style={{ fontSize: 12, margin: "var(--space-2) var(--space-4) 0", color: "var(--color-accent-800)" }}
        >
          {fetchError}
        </p>
      )}
      {showConfigBanner && (
        <ConfigWarningBanner warnings={configWarnings} onDismiss={() => setShowConfigBanner(false)} />
      )}

      {showEmptyState ? (
        <div style={{ padding: "var(--space-8) var(--space-4)", display: "flex", justifyContent: "center" }}>
          <Blueprint style={{ maxWidth: 420, padding: "var(--space-4)", textAlign: "center" }}>
            <div className="card-title" style={{ marginBottom: 6 }}>
              {EMPTY_STATES[mode].title}
            </div>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              {EMPTY_STATES[mode].body}
            </p>
          </Blueprint>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr 340px",
            gap: "var(--space-4)",
            padding: "var(--space-4)",
            alignItems: "start",
          }}
        >
          <SessionList
            mode={mode}
            sessions={listForMode}
            selectedSessionId={session?.id ?? null}
            onSelect={handleSelectSession}
          />

          <div>
            {session ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--space-2)",
                    flexWrap: "wrap",
                    marginBottom: "var(--space-3)",
                  }}
                >
                  <h3 className="truncate" style={{ margin: 0, maxWidth: 360 }}>
                    {session.title}
                  </h3>
                  <Tag variant="accent">{session.model}</Tag>
                  <Tag variant={session.usageDataAvailable ? "accent" : "outline"}>
                    {session.usageDataAvailable ? "usage: known" : "usage: unavailable"}
                  </Tag>
                  {allCostsKnown ? (
                    <CostSparkline turns={session.turns} />
                  ) : (
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      cost: unavailable
                    </span>
                  )}
                </div>
                <TurnsTable turns={session.turns} selectedTurnIndex={selectedTurnIndex} onSelectTurn={selectTurn} />
                <div style={{ marginTop: "var(--space-4)" }}>
                  <TimelineScrubber
                    turnCount={session.turns.length}
                    selectedTurnIndex={selectedTurnIndex}
                    onSelectTurn={selectTurn}
                  />
                </div>
              </>
            ) : (
              <p className="text-muted" style={{ fontSize: 13 }}>
                Select a {mode === "learn" ? "scenario" : "session"} to view its turns.
              </p>
            )}
          </div>

          <div>
            {mode === "analyze" ? (
              <SegmentedControl
                name="right-tab"
                options={RIGHT_TAB_OPTIONS}
                value={rightTab}
                onChange={setRightTab}
                className="right-tab-seg"
              />
            ) : (
              <h6 style={{ margin: "0 0 0 var(--space-1)" }}>Explanation</h6>
            )}
            <div style={{ marginTop: "var(--space-2)" }}>
              {(mode === "learn" || rightTab === "explanation") && (
                <ExplanationPanel turn={selectedTurn} mode={mode} toolCallsAvailable={toolCallsAvailable} />
              )}
              {mode === "analyze" && rightTab === "system-prompt" && (
                <SystemPromptBreakdown components={session?.systemPrompt ?? []} />
              )}
              {mode === "analyze" && rightTab === "tools" && (
                <ToolInventoryPanel entries={session?.toolInventory ?? []} />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
