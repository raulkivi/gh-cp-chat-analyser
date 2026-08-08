import { createReadStream, existsSync } from "node:fs";
import { createInterface } from "node:readline";

// Generic envelope shape (architecture.md §7). Only `type` is relied on by
// this adapter; everything else is intentionally optional/untyped since the
// `attrs` shape is undocumented and varies by event type/provider.
export interface JsonlEnvelope {
  v?: number;
  ts?: number;
  dur?: number;
  sid?: string;
  spanId?: string;
  type: string;
  name?: string;
  status?: string;
  attrs?: Record<string, unknown>;
}

function parseEnvelopeLine(line: string): JsonlEnvelope | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { type?: unknown }).type === "string"
    ) {
      return parsed as JsonlEnvelope;
    }
    return null;
  } catch {
    return null;
  }
}

// Streams the file line-by-line (never buffers the whole log at once,
// per §11.1) and defensively parses each line into an envelope. Malformed
// or unrecognizable lines are skipped, not treated as errors (§7).
export async function readMainJsonlEnvelopes(
  filePath: string,
): Promise<JsonlEnvelope[]> {
  if (!existsSync(filePath)) {
    return [];
  }

  const envelopes: JsonlEnvelope[] = [];
  const lines = createInterface({
    input: createReadStream(filePath, "utf-8"),
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    const envelope = parseEnvelopeLine(line);
    if (envelope) {
      envelopes.push(envelope);
    }
  }

  return envelopes;
}

export type MainJsonlAvailability =
  "missing" | "logging-never-enabled" | "events-present";

// Cheap gating check (§7): a session's main.jsonl containing at most the
// single session_start line means logging was never enabled while it ran —
// the expected default case (constraint 8), not an error.
export async function classifyMainJsonlAvailability(
  filePath: string,
): Promise<MainJsonlAvailability> {
  if (!existsSync(filePath)) {
    return "missing";
  }

  const envelopes = await readMainJsonlEnvelopes(filePath);
  return envelopes.length > 1 ? "events-present" : "logging-never-enabled";
}
