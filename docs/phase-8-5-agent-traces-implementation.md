# Phase 8.5 implementation plan: agent-traces cache-write/reasoning enrichment

This document turns [implementation-plan.md](implementation-plan.md)'s Phase
8.5 goal into build-ready detail and records what was actually built. It
assumes [architecture.md §5](architecture.md)'s `TurnUsage` shape and §6.2's
`main.jsonl` extraction pipeline, and
[copilot-chat-source-investigation.md](copilot-chat-source-investigation.md)'s
findings (§5b–§5f), which this phase acts on directly.

## 1. Why this phase exists, and why it isn't part of Phase 9

`TurnUsage.cacheWrite`/`.reasoning` have existed in the domain schema since
Phase 1, but every code path that constructs a `TurnUsage` hardcoded both to
`{known: false}` — `main.jsonl`, the only source Analyze mode read, simply
doesn't expose either figure (confirmed at the source level, not just
empirically). The source investigation found and empirically confirmed
(against a real capture on the development machine) a second, optional local
file GitHub Copilot Chat can write, `agent-traces.db`, which does carry both
— real, non-zero, internally coherent values, joinable back to `main.jsonl`'s
`llm_request` entries via a shared `responseId`.

Phase 9's `LogProvider`/registry/mitmproxy work was, at the time this phase
started, entirely unimplemented (confirmed: no `LogProvider` interface, no
registry, no `/api/log-providers` route anywhere in the repo). Building the
full provider abstraction just to add one more optional local enrichment
would have been substantially more scope than the problem required, and would
duplicate work Phase 9 will do anyway when it adapts the VS Code path to that
contract. This phase instead extends the current, directly-wired pipeline
(`app.ts` → `data-sources/sqlite` + `data-sources/jsonl` + `session-enricher`)
the same way Phase 6 ("Analyze-mode-only extras") did for system-prompt
breakdown and tool inventory — additive, no new abstraction layer, no
dependency on or from Phase 9.

## 2. Resolved decision: `responseId` as the join key

`main.jsonl`'s `llm_request` entries and `agent-traces.db`'s `chat`-operation
spans both carry the same request-identifying UUID — `attrs.responseId` on
one side, the `gen_ai.response.id` `span_attributes` row on the other,
confirmed identical across a real capture. This is a more precise join than
either `turn_index` (confirmed empty/unpopulated in `agent-traces.db`) or
chronological ordering (fragile across concurrent/reordered spans).

`responseId` was already present in raw `main.jsonl` text but silently
stripped by `main-jsonl-reader.ts`'s `KNOWN_ATTRS_KEYS` allow-list (a
2026-08-08 security-review fix bounding parsed `attrs` to only known-used
keys) before any extractor ever saw it. Fixing that allow-list was the
first, load-bearing step — every other piece of this phase silently no-ops
without it.

## 3. Resolved decision: additive, all-or-nothing per turn

`extractTurnUsages` gained a defaulted second parameter,
`agentTraceUsageByResponseId: Map<string, AgentTraceUsage>`, empty by
default so every existing caller is unaffected. For a turn with multiple
`llm_request` spans (an agentic tool-calling loop), `cacheWrite`/`reasoning`
are only marked `known: true` if **every** request in the turn resolves in
the map — otherwise both stay `{known: false}` with a new, actionable
`AGENT_TRACES_UNAVAILABLE_REASON`, mirroring `aggregateAiCredits`'s existing
all-or-nothing shape rather than silently understating a partial sum.

`tool`/`vision` remain on the old `USAGE_CATEGORY_NOT_EXPOSED_REASON` — they
have no known local source at all, unlike `cacheWrite`/`reasoning` now.

## 4. Resolved decision: this data source is explicitly optional and best-effort

Unlike `data-sources/sqlite/session-store.ts` (load-bearing — the whole
session comes from it, allowed to throw), `agent-traces-reader.ts` treats
every failure mode as "unavailable," never a request failure:

- No VS Code install / file doesn't exist (the common case, setting off):
  `resolveAgentTracesDbPath` returns `null`, `loadAgentTraceUsageForResponseIds`
  returns an empty map without touching the filesystem.
- File exists but a given `responseId` has no matching span (setting
  enabled after that session ran — non-retroactive, same caveat as
  `agentDebugLog.fileLogging.enabled`): that `responseId` simply isn't a key
  in the returned map.
- Locked/corrupt/mid-write db file: caught, degrades to an empty map.
- A span matches but has no `gen_ai.usage.cache_creation.input_tokens`
  attribute (legitimate — that request didn't cache-write): `cacheWrite: 0`,
  still `known: true`, not unavailable.

## 5. Contracts

```ts
// packages/server/src/data-sources/agent-traces/agent-traces-reader.ts
export interface AgentTraceUsage {
  cacheWrite: number;
  reasoning: number;
}
export function getAgentTraceUsageByResponseIds(
  db: DatabaseSync,
  responseIds: string[],
): Map<string, AgentTraceUsage>;
export function loadAgentTraceUsageForResponseIds(
  dbPath: string | null,
  responseIds: string[],
): Map<string, AgentTraceUsage>;

// packages/server/src/data-sources/jsonl/session-usage-spans.ts
export function collectResponseIds(envelopes: JsonlEnvelope[]): string[];
export function extractTurnUsages(
  envelopes: JsonlEnvelope[],
  agentTraceUsageByResponseId?: Map<string, AgentTraceUsage>,
): (TurnUsage | null)[];
```

`packages/domain/src/config-warning.ts`'s `ConfigWarning` gained
`severity: "required" | "optional"` (non-defaulted) alongside a fourth
`code`, `"agent-traces-unavailable"` — the only domain-schema change this
phase needed (`TurnUsage` itself was already correct).

## 6. Module-by-module TDD sequence (as executed)

1. `main-jsonl-reader.ts`: `responseId` added to `KNOWN_ATTRS_KEYS` — failing
   test first, confirmed against `llm-request-sample.jsonl`.
2. `llm-request-extractor.ts`: `responseId` added to `LlmRequestUsage`.
3. `data-sources/sqlite/copilot-chat-global-storage-path.ts` extracted from
   `session-store-path.ts` (pure refactor, existing test unchanged) so
   `agent-traces-db-path.ts` could reuse the same directory construction.
4. `agent-traces-reader.ts`: `getAgentTraceUsageByResponseIds` (fixture-driven:
   matching row, no-match row, absent cache-creation attribute, null
   `reasoning_tokens`, multi-responseId, non-`chat`-operation spans ignored),
   then `loadAgentTraceUsageForResponseIds` (null path, corrupt-file degrade).
5. `session-usage-spans.ts`: `collectResponseIds`, then `extractTurnUsages`'s
   new parameter (matched-sum case, any-unmatched-degrades-whole-turn case).
6. `app.ts`: `agentTracesDbPath` added to `CreateAppOptions`, wired into
   `GET /api/sessions/:id` alongside the existing `main.jsonl` resolution.
7. `read-vscode-settings.ts`: `agentTracesEnabled` field.
8. `config-check.ts`: `severity` added to the three existing warning
   builders (a deliberate red step — their exact-shape test assertions
   needed updating), then the new `buildAgentTracesUnavailableWarning`.
9. `packages/domain`: schema round-trip tests for the new `code`/`severity`.
10. `ConfigWarningBanner.tsx`: `data-severity` marker + muted-tone styling
    for `optional`, reusing the existing `--color-accent-2-*` token pair
    (no new CSS custom properties needed).
11. Documentation (this doc, plus README/UserGuide/architecture.md/
    implementation-plan.md).

## 7. Fixtures

All fixtures are synthetic, built in TypeScript against the real, confirmed
schema (`spans`/`span_attributes`) rather than checked-in binary `.db`
files — the same `new DatabaseSync(dbFile)` + `db.exec(schema)` pattern
`data-sources/sqlite/session-store.test.ts` already used, shared via a small
new helper, `test-support/temp-sqlite-db.ts`. No real captured
`agent-traces.db` content is committed anywhere in this repo.

## 8. Where the code lives

- `packages/server/src/data-sources/agent-traces/` — `agent-traces-db-path.ts`,
  `agent-traces-reader.ts`.
- `packages/server/src/data-sources/sqlite/copilot-chat-global-storage-path.ts`
  — shared path helper (`session-store-path.ts` refactored onto it).
- `packages/server/src/data-sources/jsonl/session-usage-spans.ts` — enrichment
  wiring, `AGENT_TRACES_UNAVAILABLE_REASON`.
- `packages/server/src/services/config-check/config-check.ts` — the new
  warning builder and gating.
- `packages/domain/src/config-warning.ts` — `severity` field, new `code`.
- `packages/web/src/components/ConfigWarningBanner.tsx` — severity styling.
- `packages/server/src/test-support/temp-sqlite-db.ts` — shared test helper.

## 9. Exit criterion (met)

With `github.copilot.chat.otel.dbSpanExporter.enabled` on and a real session
recorded, `GET /api/sessions/:id` returns real `{known:true,value}`
`cacheWrite`/`reasoning` figures matching direct SQLite inspection of
`agent-traces.db` for that session's `responseId`s. With the setting off (the
default), behavior is unchanged except for a more actionable `reason`
string, and `GET /api/config/status` surfaces the new optional-severity
warning, rendered visually distinct from required warnings.

## 10. Explicitly out of scope for Phase 8.5

- Any `LogProvider`/registry/mitmproxy work — Phase 9, untouched and
  independent of this phase.
- Auditing `copilotUsageNanoAiu`/AI Credits against `rate × tokens` math —
  not buildable from any local data source (the source investigation's §5e
  finding: cost is a pre-computed server-side figure, not derived from
  token counts client-side).
- Exposing `agentTracesEnabled`/the new warning's setting id via any
  settings-write path — this app remains strictly read-only aside from the
  one existing `app-settings` write path Phase 9 will introduce.
