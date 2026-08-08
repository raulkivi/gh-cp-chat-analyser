import { readFile } from "node:fs/promises";
import path from "node:path";

// An `llm_request` span's `attrs.systemPromptFile`/`toolsFile` name a sibling
// JSON file in the session's own debug-logs directory (architecture.md §6.2
// Phase 6 note) — not inline data. Each artifact is double-encoded on disk:
// `{ content: "<JSON-stringified array>" }`. Both readers are defensive per
// §7: any missing file or unrecognized shape yields null, never a throw or a
// fabricated value.
async function readArtifactContentArray(
  dirPath: string,
  fileName: string,
): Promise<unknown[] | null> {
  let raw: string;
  try {
    raw = await readFile(path.join(dirPath, fileName), "utf-8");
  } catch {
    return null;
  }

  try {
    const outer: unknown = JSON.parse(raw);
    const content = (outer as { content?: unknown }).content;
    if (typeof content !== "string") {
      return null;
    }

    const inner: unknown = JSON.parse(content);
    return Array.isArray(inner) ? inner : null;
  } catch {
    return null;
  }
}

// The system-prompt artifact observed on this machine is a single-element
// array (`[{ type: "text", content: "<full prompt>" }]`) — every text-typed
// entry's content is concatenated defensively in case a future version
// splits it into more than one entry.
export async function readSystemPromptText(
  dirPath: string,
  fileName: string,
): Promise<string | null> {
  const entries = await readArtifactContentArray(dirPath, fileName);
  if (!entries) {
    return null;
  }

  const textParts = entries
    .filter(
      (entry): entry is { type: string; content: string } =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { type?: unknown }).type === "text" &&
        typeof (entry as { content?: unknown }).content === "string",
    )
    .map((entry) => entry.content);

  return textParts.length > 0 ? textParts.join("\n\n") : null;
}

// The tools artifact is an array of tool-definition objects (JSON-schema
// shaped: type/name/description/parameters) — this is the definitive list
// of tools actually loaded for the request, independent of which ones were
// invoked (see tool-inventory.ts).
export async function readToolDefinitionNames(
  dirPath: string,
  fileName: string,
): Promise<string[] | null> {
  const entries = await readArtifactContentArray(dirPath, fileName);
  if (!entries) {
    return null;
  }

  return entries
    .filter(
      (entry): entry is { name: string } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string",
    )
    .map((entry) => entry.name);
}
