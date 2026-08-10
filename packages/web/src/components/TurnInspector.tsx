import { useEffect, useState } from "react";
import type { MessageContentPart, TriggeredEvent, TurnInspectorDetail } from "@gh-cp-chat-analyser/domain";
import { fetchTurnInspectorDetail } from "../api-client/sessions.js";
import { TRIGGER_LABELS } from "../lib/trigger-labels.js";
import { Blueprint } from "./ui/Blueprint.js";
import { Tag } from "./ui/Tag.js";

interface TurnInspectorProps {
  sessionId: string;
  turnIndex: number;
  sessionTitle?: string;
  triggeredEvent?: TriggeredEvent;
  // Session.usageDataAvailable, already known from the GET /api/sessions/:id
  // call the UI made before this could be opened — lets the empty state
  // pick the right message without waiting on this endpoint's own fetch
  // (turn-inspector-plan.md §5.3/§5.7).
  usageDataAvailable: boolean;
  onClose: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; detail: TurnInspectorDetail };

const NO_LOGGING_MESSAGE =
  "No request/response data captured for this session — enable agentDebugLog.fileLogging.enabled and reload VS Code.";
const NO_ROUND_TRIP_MESSAGE = "This turn made no request to the model.";
const LOAD_FAILED_MESSAGE = "Failed to load this turn's request/response data.";

function formatBytes(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ContentPartView({ part }: { part: MessageContentPart }) {
  if (part.kind === "text") {
    return <>{part.text}</>;
  }
  if (part.kind === "image") {
    return (
      <Tag variant="outline" style={{ display: "inline-flex", margin: "2px 4px 2px 0" }}>
        🖼️ image
      </Tag>
    );
  }
  const label = [part.path, part.sizeBytes !== undefined ? formatBytes(part.sizeBytes) : undefined]
    .filter(Boolean)
    .join(" · ");
  return (
    <Tag variant="outline" style={{ display: "inline-flex", margin: "2px 4px 2px 0" }}>
      📄 {label || "file"}
    </Tag>
  );
}

function ContentPartsView({ parts }: { parts: MessageContentPart[] }) {
  if (parts.length === 0) {
    return (
      <p className="text-muted" style={{ fontSize: 12, margin: 0 }}>
        —
      </p>
    );
  }
  return (
    <pre
      style={{
        margin: 0,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        fontFamily: "monospace",
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {parts.map((part, index) => (
        <ContentPartView key={index} part={part} />
      ))}
    </pre>
  );
}

function ToolCallsView({
  toolCalls,
}: {
  toolCalls: TurnInspectorDetail["rounds"][number]["request"]["toolCalls"];
}) {
  if (toolCalls.length === 0) {
    return null;
  }
  return (
    <div
      style={{
        marginBottom: "var(--space-2)",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      {toolCalls.map((toolCall, index) => (
        <div key={`${toolCall.name}-${index}`}>
          <Tag variant="neutral" style={{ fontFamily: "monospace", marginBottom: 4, display: "inline-flex" }}>
            {toolCall.name}
          </Tag>
          <ContentPartsView parts={toolCall.args} />
          <ContentPartsView parts={toolCall.result} />
        </div>
      ))}
    </div>
  );
}

export function TurnInspector({
  sessionId,
  turnIndex,
  sessionTitle,
  triggeredEvent,
  usageDataAvailable,
  onClose,
}: TurnInspectorProps) {
  const [state, setState] = useState<LoadState>(
    usageDataAvailable ? { status: "loading" } : { status: "error" },
  );

  useEffect(() => {
    if (!usageDataAvailable) {
      setState({ status: "error" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    fetchTurnInspectorDetail(sessionId, turnIndex)
      .then((detail) => {
        if (!cancelled) setState({ status: "ready", detail });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, turnIndex, usageDataAvailable]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", padding: "var(--space-4)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          ← Back to session
        </button>
        {sessionTitle && (
          <span className="text-muted" style={{ fontSize: 12 }}>
            {sessionTitle}
          </span>
        )}
        <h4 style={{ margin: 0 }}>Turn {turnIndex} inspector</h4>
        {triggeredEvent && <Tag variant="outline">{TRIGGER_LABELS[triggeredEvent]}</Tag>}
      </div>

      {state.status === "loading" && <p className="text-muted">Loading turn detail…</p>}
      {state.status === "error" && (
        <p className="text-muted">{usageDataAvailable ? LOAD_FAILED_MESSAGE : NO_LOGGING_MESSAGE}</p>
      )}
      {state.status === "ready" && state.detail.rounds.length === 0 && (
        <p className="text-muted">{NO_ROUND_TRIP_MESSAGE}</p>
      )}

      {state.status === "ready" && state.detail.rounds.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {state.detail.rounds.map((round) => (
            <div
              key={round.request.index}
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}
            >
              <Blueprint style={{ padding: "var(--space-3)" }}>
                <div className="card-kicker" style={{ marginBottom: "var(--space-2)" }}>
                  Request · round {round.request.index}
                </div>
                <ToolCallsView toolCalls={round.request.toolCalls} />
                <ContentPartsView parts={round.request.addedMessages} />
              </Blueprint>
              <Blueprint style={{ padding: "var(--space-3)" }}>
                <div className="card-kicker" style={{ marginBottom: "var(--space-2)" }}>
                  Response · round {round.response.index}
                </div>
                <ContentPartsView parts={round.response.response} />
                {round.response.reasoning && (
                  <div
                    style={{
                      marginTop: "var(--space-2)",
                      borderTop: "1px solid var(--color-divider)",
                      paddingTop: "var(--space-2)",
                    }}
                  >
                    <div className="card-kicker" style={{ marginBottom: "var(--space-2)" }}>
                      Reasoning
                    </div>
                    <ContentPartsView parts={round.response.reasoning} />
                  </div>
                )}
              </Blueprint>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
