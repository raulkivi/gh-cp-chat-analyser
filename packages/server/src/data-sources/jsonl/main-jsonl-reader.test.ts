import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  classifyEnvelopesAvailability,
  classifyMainJsonlAvailability,
  readMainJsonlEnvelopes,
} from "./main-jsonl-reader.js";

const fixturesDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../fixtures/jsonl",
);
const sessionStartOnlyPath = path.join(fixturesDir, "session-start-only.jsonl");
const syntheticMultiEventPath = path.join(
  fixturesDir,
  "synthetic-multi-event.jsonl",
);
const missingPath = path.join(fixturesDir, "does-not-exist.jsonl");

describe("readMainJsonlEnvelopes", () => {
  it("returns an empty array when the file doesn't exist", async () => {
    expect(await readMainJsonlEnvelopes(missingPath)).toEqual([]);
  });

  it("parses a real captured session_start-only log", async () => {
    const envelopes = await readMainJsonlEnvelopes(sessionStartOnlyPath);

    expect(envelopes).toHaveLength(1);
    expect(envelopes[0].type).toBe("session_start");
    expect(envelopes[0].sid).toBe("2137cba5-8ad3-4f7c-9a18-f8d716ed8683");
  });

  it("defensively skips malformed and blank lines, keeping well-formed ones", async () => {
    const envelopes = await readMainJsonlEnvelopes(syntheticMultiEventPath);

    expect(envelopes.map((envelope) => envelope.type)).toEqual([
      "session_start",
      "llm_request",
      "some_future_event_type",
    ]);
  });
});

describe("classifyMainJsonlAvailability", () => {
  it("returns 'missing' when the file doesn't exist", async () => {
    expect(await classifyMainJsonlAvailability(missingPath)).toBe("missing");
  });

  it("returns 'logging-never-enabled' when the file only has a session_start line", async () => {
    expect(await classifyMainJsonlAvailability(sessionStartOnlyPath)).toBe(
      "logging-never-enabled",
    );
  });

  it("returns 'events-present' when the file has more than one event", async () => {
    expect(await classifyMainJsonlAvailability(syntheticMultiEventPath)).toBe(
      "events-present",
    );
  });
});

describe("classifyEnvelopesAvailability", () => {
  it("classifies from an already-read envelope array, without touching the filesystem", () => {
    expect(classifyEnvelopesAvailability([])).toBe("logging-never-enabled");
    expect(
      classifyEnvelopesAvailability([{ type: "session_start" }]),
    ).toBe("logging-never-enabled");
    expect(
      classifyEnvelopesAvailability([
        { type: "session_start" },
        { type: "llm_request" },
      ]),
    ).toBe("events-present");
  });
});
