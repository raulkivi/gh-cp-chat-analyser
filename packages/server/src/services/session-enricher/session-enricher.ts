import type {
  Session,
  TokenCount,
  ToolCallRecord,
  Turn,
} from "@gh-cp-chat-analyser/domain";
import type {
  SessionFileRow,
  SessionRow,
  TurnRow,
} from "../../data-sources/sqlite/session-store.js";
import type { MainJsonlAvailability } from "../../data-sources/jsonl/main-jsonl-reader.js";

// Two reasons, per architecture.md §6.2: one is actionable (constraint 8),
// the other isn't. Extraction of real numbers from "events-present" logs is
// still Phase 4 work in progress — no extractor registry exists yet, so
// that case degrades to the same generic reason as "missing"/older-shape.
export const LOGGING_NEVER_ENABLED_REASON =
  "GitHub Copilot Chat debug logging (github.copilot.chat.agentDebugLog.fileLogging.enabled) " +
  "was off while this session ran, so no usage data was recorded. Enable it in VS Code " +
  "settings and reload the window to capture usage data for future sessions.";
export const USAGE_UNAVAILABLE_REASON =
  "Usage data is unavailable for this session (main.jsonl is missing, uses an " +
  "older/unsupported log format, or its usage data could not be extracted).";
const UNKNOWN_MODEL = "unknown";
const STUB_EXPLANATION =
  "Token and cost usage data is not available for this turn (main.jsonl parsing is not implemented yet).";

function reasonForAvailability(availability: MainJsonlAvailability): string {
  return availability === "logging-never-enabled"
    ? LOGGING_NEVER_ENABLED_REASON
    : USAGE_UNAVAILABLE_REASON;
}

function deriveTitle(row: SessionRow): string {
  return row.summary || row.repository || row.cwd || `Session ${row.id}`;
}

function buildToolCalls(
  turnIndex: number,
  fileRows: SessionFileRow[],
): ToolCallRecord[] {
  const filesForTurn = fileRows.filter((row) => row.turn_index === turnIndex);

  const filesByToolName = new Map<string, string[]>();
  for (const row of filesForTurn) {
    const name = row.tool_name ?? "unknown tool";
    const files = filesByToolName.get(name) ?? [];
    files.push(row.file_path);
    filesByToolName.set(name, files);
  }

  return Array.from(filesByToolName.entries()).map(([name, filesTouched]) => ({
    name,
    argsSummary: filesTouched.join(", "),
    filesTouched,
  }));
}

function buildTurn(
  row: TurnRow,
  fileRows: SessionFileRow[],
  unavailableTokenCount: TokenCount,
): Turn {
  return {
    index: row.turn_index,
    userMessage: row.user_message ?? "",
    assistantResponse: row.assistant_response ?? "",
    toolCalls: buildToolCalls(row.turn_index, fileRows),
    usage: {
      uncachedInput: unavailableTokenCount,
      cacheWrite: unavailableTokenCount,
      cacheRead: unavailableTokenCount,
      tool: unavailableTokenCount,
      vision: unavailableTokenCount,
      reasoning: unavailableTokenCount,
      output: unavailableTokenCount,
      costUsd: unavailableTokenCount,
      model: UNKNOWN_MODEL,
    },
    explanation: STUB_EXPLANATION,
  };
}

export function buildSessionSummary(row: SessionRow): Session {
  return {
    id: row.id,
    mode: "analyze",
    title: deriveTitle(row),
    model: UNKNOWN_MODEL,
    turns: [],
    usageDataAvailable: false,
  };
}

export function buildSession(
  sessionRow: SessionRow,
  turnRows: TurnRow[],
  fileRows: SessionFileRow[],
  mainJsonlAvailability: MainJsonlAvailability,
): Session {
  const unavailableTokenCount: TokenCount = {
    known: false,
    reason: reasonForAvailability(mainJsonlAvailability),
  };

  return {
    ...buildSessionSummary(sessionRow),
    turns: turnRows.map((turnRow) =>
      buildTurn(turnRow, fileRows, unavailableTokenCount),
    ),
  };
}
