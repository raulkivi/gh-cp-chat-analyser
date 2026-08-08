import type { Session, TokenCount, ToolCallRecord, Turn } from "@gh-cp-chat-analyser/domain";
import type {
  SessionFileRow,
  SessionRow,
  TurnRow,
} from "../../data-sources/sqlite/session-store.js";

const UNAVAILABLE_REASON = "main.jsonl parsing not yet implemented";
const UNAVAILABLE_TOKEN_COUNT: TokenCount = { known: false, reason: UNAVAILABLE_REASON };
const UNKNOWN_MODEL = "unknown";
const STUB_EXPLANATION =
  "Token and cost usage data is not available for this turn (main.jsonl parsing is not implemented yet).";

function deriveTitle(row: SessionRow): string {
  return row.summary || row.repository || row.cwd || `Session ${row.id}`;
}

function buildToolCalls(turnIndex: number, fileRows: SessionFileRow[]): ToolCallRecord[] {
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

function buildTurn(row: TurnRow, fileRows: SessionFileRow[]): Turn {
  return {
    index: row.turn_index,
    userMessage: row.user_message ?? "",
    assistantResponse: row.assistant_response ?? "",
    toolCalls: buildToolCalls(row.turn_index, fileRows),
    usage: {
      uncachedInput: UNAVAILABLE_TOKEN_COUNT,
      cacheWrite: UNAVAILABLE_TOKEN_COUNT,
      cacheRead: UNAVAILABLE_TOKEN_COUNT,
      tool: UNAVAILABLE_TOKEN_COUNT,
      vision: UNAVAILABLE_TOKEN_COUNT,
      reasoning: UNAVAILABLE_TOKEN_COUNT,
      output: UNAVAILABLE_TOKEN_COUNT,
      costUsd: UNAVAILABLE_TOKEN_COUNT,
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
): Session {
  return {
    ...buildSessionSummary(sessionRow),
    turns: turnRows.map((turnRow) => buildTurn(turnRow, fileRows)),
  };
}
