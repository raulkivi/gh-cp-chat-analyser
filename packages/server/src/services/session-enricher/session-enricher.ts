import type {
  Session,
  SystemPromptComponent,
  TokenCount,
  ToolCallRecord,
  ToolInventoryEntry,
  Turn,
  TurnUsage,
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
export const PARSE_FAILURES_REASON =
  "main.jsonl for this session has content, but none of its lines could be " +
  "parsed into a usable event — this looks like a parser regression or a " +
  "corrupted log file, not a settings problem.";
const UNKNOWN_MODEL = "unknown";
const STUB_EXPLANATION =
  "Token and cost usage data is not available for this turn (main.jsonl parsing is not implemented yet).";
export const TOOL_CALL_TOKEN_COUNT_UNAVAILABLE_REASON =
  "GitHub Copilot Chat's local debug log does not record a token count for individual tool calls.";

function reasonForAvailability(availability: MainJsonlAvailability): string {
  if (availability === "logging-never-enabled") {
    return LOGGING_NEVER_ENABLED_REASON;
  }
  if (availability === "parse-failures") {
    return PARSE_FAILURES_REASON;
  }
  return USAGE_UNAVAILABLE_REASON;
}

function deriveTitle(row: SessionRow): string {
  return row.summary || row.repository || row.cwd || `Session ${row.id}`;
}

function unavailableToolCallTokenCount(): TokenCount {
  return { known: false, reason: TOOL_CALL_TOKEN_COUNT_UNAVAILABLE_REASON };
}

// SQLite's session_files rows only cover tools that touched a file — tools
// like manage_todo_list/run_in_terminal never appear there. invokedToolNames
// (from main.jsonl's tool_call events, jsonl/tool-inventory.ts) fills that
// gap; a name already covered by a file-based entry isn't duplicated. Every
// entry's tokenCount is explicit-unavailable (constraint 6): neither source
// records a per-tool-call token figure.
function buildToolCalls(
  turnIndex: number,
  fileRows: SessionFileRow[],
  invokedToolNames: string[],
): ToolCallRecord[] {
  const filesForTurn = fileRows.filter((row) => row.turn_index === turnIndex);

  const filesByToolName = new Map<string, string[]>();
  for (const row of filesForTurn) {
    const name = row.tool_name ?? "unknown tool";
    const files = filesByToolName.get(name) ?? [];
    files.push(row.file_path);
    filesByToolName.set(name, files);
  }

  const fileBasedCalls: ToolCallRecord[] = Array.from(
    filesByToolName.entries(),
  ).map(([name, filesTouched]) => ({
    name,
    argsSummary: filesTouched.join(", "),
    filesTouched,
    tokenCount: unavailableToolCallTokenCount(),
  }));

  const invokedOnlyNames = Array.from(
    new Set(invokedToolNames.filter((name) => !filesByToolName.has(name))),
  );
  const invokedOnlyCalls: ToolCallRecord[] = invokedOnlyNames.map((name) => ({
    name,
    argsSummary: "",
    tokenCount: unavailableToolCallTokenCount(),
  }));

  return [...fileBasedCalls, ...invokedOnlyCalls];
}

function buildUnavailableUsage(unavailableTokenCount: TokenCount): TurnUsage {
  return {
    uncachedInput: unavailableTokenCount,
    cacheWrite: unavailableTokenCount,
    cacheRead: unavailableTokenCount,
    tool: unavailableTokenCount,
    vision: unavailableTokenCount,
    reasoning: unavailableTokenCount,
    output: unavailableTokenCount,
    costUsd: unavailableTokenCount,
    model: UNKNOWN_MODEL,
  };
}

function tokenCountValue(tokenCount: TokenCount): number {
  return tokenCount.known ? tokenCount.value : 0;
}

function buildAnalyzeExplanation(usage: TurnUsage): string {
  const uncachedInput = tokenCountValue(usage.uncachedInput).toLocaleString();
  const cacheRead = tokenCountValue(usage.cacheRead).toLocaleString();
  const output = tokenCountValue(usage.output).toLocaleString();
  return (
    `This turn sent ${uncachedInput} new input token(s) and reused ` +
    `${cacheRead} from cache, producing ${output} output token(s) using ${usage.model}.`
  );
}

function buildTurn(
  row: TurnRow,
  fileRows: SessionFileRow[],
  usage: TurnUsage | null | undefined,
  unavailableTokenCount: TokenCount,
  invokedToolNames: string[],
): Turn {
  return {
    index: row.turn_index,
    userMessage: row.user_message ?? "",
    assistantResponse: row.assistant_response ?? "",
    toolCalls: buildToolCalls(row.turn_index, fileRows, invokedToolNames),
    usage: usage ?? buildUnavailableUsage(unavailableTokenCount),
    explanation: usage ? buildAnalyzeExplanation(usage) : STUB_EXPLANATION,
  };
}

export function buildSessionSummary(row: SessionRow): Session {
  return {
    id: row.id,
    mode: "analyze",
    title: deriveTitle(row),
    model: UNKNOWN_MODEL,
    turns: [],
    turnCount: row.turn_count,
    usageDataAvailable: false,
    ...(row.created_at ? { startedAt: row.created_at } : {}),
  };
}

export function buildSession(
  sessionRow: SessionRow,
  turnRows: TurnRow[],
  fileRows: SessionFileRow[],
  mainJsonlAvailability: MainJsonlAvailability,
  turnUsages: (TurnUsage | null)[] = [],
  invokedToolNamesByTurn: string[][] = [],
  systemPrompt: SystemPromptComponent[] = [],
  toolInventory: ToolInventoryEntry[] = [],
): Session {
  const unavailableTokenCount: TokenCount = {
    known: false,
    reason: reasonForAvailability(mainJsonlAvailability),
  };

  const knownUsages = turnUsages.filter(
    (usage): usage is TurnUsage => usage !== null,
  );

  return {
    ...buildSessionSummary(sessionRow),
    model:
      knownUsages.length > 0
        ? knownUsages[knownUsages.length - 1].model
        : UNKNOWN_MODEL,
    usageDataAvailable: knownUsages.length > 0,
    systemPrompt,
    toolInventory,
    turnCount: turnRows.length,
    turns: turnRows.map((turnRow) =>
      buildTurn(
        turnRow,
        fileRows,
        turnUsages[turnRow.turn_index],
        unavailableTokenCount,
        invokedToolNamesByTurn[turnRow.turn_index] ?? [],
      ),
    ),
  };
}
