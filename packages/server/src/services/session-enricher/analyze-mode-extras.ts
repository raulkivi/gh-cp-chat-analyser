import path from "node:path";
import type {
  SystemPromptComponent,
  ToolInventoryEntry,
} from "@gh-cp-chat-analyser/domain";
import {
  readSystemPromptText,
  readToolDefinitionNames,
} from "../../data-sources/jsonl/prompt-artifact-reader.js";
import { buildSystemPromptBreakdown } from "../../data-sources/jsonl/system-prompt-breakdown.js";
import {
  buildToolInventory,
  extractInvokedToolNamesByTurn,
} from "../../data-sources/jsonl/tool-inventory.js";
import type { JsonlEnvelope } from "../../data-sources/jsonl/main-jsonl-reader.js";

export interface AnalyzeModeExtras {
  invokedToolNamesByTurn: string[][];
  systemPrompt: SystemPromptComponent[];
  toolInventory: ToolInventoryEntry[];
}

// Phase 6: system-prompt/tool-inventory detail is only derivable from the
// systemPromptFile/toolsFile named on an llm_request span (architecture.md
// §6.2 Phase 6 note) — the last such span is used, mirroring the existing
// "last known turn's model" precedent in session-enricher.ts. When no
// llm_request span carries those fields (older/unknown shape), the
// tool-inventory still degrades to invoked-only entries rather than being
// dropped entirely.
export async function buildAnalyzeModeExtras(
  envelopes: JsonlEnvelope[],
  mainJsonlPath: string,
): Promise<AnalyzeModeExtras> {
  const invokedToolNamesByTurn = extractInvokedToolNamesByTurn(envelopes);

  const artifactSource = envelopes.findLast(
    (envelope): envelope is JsonlEnvelope & {
      attrs: { systemPromptFile: string; toolsFile: string };
    } =>
      envelope.type === "llm_request" &&
      typeof envelope.attrs?.systemPromptFile === "string" &&
      typeof envelope.attrs?.toolsFile === "string",
  );

  if (!artifactSource) {
    return {
      invokedToolNamesByTurn,
      systemPrompt: buildSystemPromptBreakdown(envelopes, null, null),
      toolInventory: buildToolInventory(null, invokedToolNamesByTurn),
    };
  }

  const sessionLogDir = path.dirname(mainJsonlPath);
  const [systemPromptText, loadedToolNames] = await Promise.all([
    readSystemPromptText(sessionLogDir, artifactSource.attrs.systemPromptFile),
    readToolDefinitionNames(sessionLogDir, artifactSource.attrs.toolsFile),
  ]);

  return {
    invokedToolNamesByTurn,
    systemPrompt: buildSystemPromptBreakdown(
      envelopes,
      systemPromptText,
      loadedToolNames?.length ?? null,
    ),
    toolInventory: buildToolInventory(loadedToolNames, invokedToolNamesByTurn),
  };
}
