import { useEffect, useState } from "react";
import type { Session } from "@gh-cp-chat-analyser/domain";
import { buildAdviceBundle } from "../lib/build-advice-bundle.js";
import { Blueprint } from "./ui/Blueprint.js";

interface AdviceExportPanelProps {
  sessions: Session[];
}

export function AdviceExportPanel({ sessions }: AdviceExportPanelProps) {
  const [includeToolArgs, setIncludeToolArgs] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCopied(false);
  }, [sessions, includeToolArgs]);

  if (sessions.length === 0) {
    return null;
  }

  const bundle = buildAdviceBundle(sessions, { includeToolArgs });
  const missingDetailCount = sessions.filter(
    (candidate) => candidate.turnCount > 0 && candidate.turns.length === 0,
  ).length;

  function handleCopy(): void {
    navigator.clipboard
      .writeText(bundle)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  }

  return (
    <Blueprint style={{ padding: "var(--space-3)", marginTop: "var(--space-2)" }}>
      <div className="card-kicker" style={{ marginBottom: "var(--space-2)" }}>
        {sessions.length} session{sessions.length === 1 ? "" : "s"} selected for advice
      </div>
      <p className="text-muted" style={{ fontSize: 12, margin: "0 0 var(--space-2)" }}>
        Paste this into an LLM chat to get advice on your agentic-coding workflow. Chat message text is never
        included — only session/turn metadata (token usage, cache efficiency, tool usage, prompt composition).
      </p>
      {missingDetailCount > 0 && (
        <p style={{ fontSize: 12, margin: "0 0 var(--space-2)", color: "var(--color-accent-800)" }}>
          {missingDetailCount} selected session{missingDetailCount === 1 ? " hasn't" : "s haven't"} been opened yet
          — open {missingDetailCount === 1 ? "it" : "each"} in the list first to include its turn-level detail
          (tokens, cache, tool usage).
        </p>
      )}
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: "var(--space-2)" }}>
        <input
          type="checkbox"
          aria-label="Include tool call args"
          checked={includeToolArgs}
          onChange={(event) => setIncludeToolArgs(event.target.checked)}
        />
        Include tool call args (may contain text snippets)
      </label>
      <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setPreviewOpen((open) => !open)}>
          {previewOpen ? "Hide preview" : "Preview"}
        </button>
        <button type="button" className="btn btn-primary" onClick={handleCopy}>
          Copy advice prompt
        </button>
        {copied && (
          <span className="text-muted" style={{ fontSize: 12 }}>
            Copied!
          </span>
        )}
      </div>
      {previewOpen && (
        <pre
          data-testid="advice-preview"
          style={{
            marginTop: "var(--space-2)",
            maxHeight: 260,
            overflow: "auto",
            fontSize: 11,
            whiteSpace: "pre-wrap",
          }}
        >
          {bundle}
        </pre>
      )}
    </Blueprint>
  );
}
