# Code Review Remediation Plan

Addresses the findings from the code review posted on
[issue #5](https://github.com/raulkivi/gh-cp-chat-analyser/issues/5). Follows
[implementation-plan.md](implementation-plan.md)'s phase structure: each
phase has a goal, deliverables, and an exit criterion. Per CLAUDE.md, every
deliverable is TDD-first (architecture.md §11.4) — write the failing test,
then the minimum code to pass it, then refactor — and respects SOLID module
boundaries (§11.5), in particular architecture.md:126's "the `api` layer has
no business logic" rule.

Phases are ordered by risk: security fixes first (both are one-line-cause,
high-impact), then the correctness bugs users actually hit, then the
duplication/simplification cleanup that has no user-facing effect and can
safely happen last.

## Phase A — Security fixes

**Goal**: close the two gaps against architecture.md §11.2's own stated
constraints.

- **A1. Allow-list `systemPromptFile`/`toolsFile` before use** (finding #1).
  `prompt-artifact-reader.ts:16` joins `attrs.systemPromptFile`/`toolsFile`
  from a parsed `main.jsonl` `llm_request` span straight into
  `path.join(dirPath, fileName)` with no validation, unlike `sessionId`,
  which is checked against `SESSION_ID_PATTERN`/`isValidSessionId` in
  `session-log-path.ts:12,48`.
  - Write a failing test asserting `readSystemPromptText`/
    `readToolDefinitionNames` return `null` (not throw, not read) for a
    `fileName` containing a path separator or `..` segment.
  - Add a filename allow-list check (e.g. reject anything that isn't a bare
    filename — no `/`, no `..`) in `readArtifactContentArray`, mirroring the
    existing `isValidSessionId` pattern. Reject before the `readFile` call.
  - Confirm the legitimate case (a plain filename as VS Code actually writes
    it) still passes.

- **A2. Make `readVscodeSettings` degrade instead of crashing** (finding
  #2). `read-vscode-settings.ts:24`'s `readFileSync` is the one file read in
  the codebase with no try/catch, unlike `prompt-artifact-reader.ts` and
  `main-jsonl-reader.ts`, which both degrade to `null`/empty on read
  failure. It's invoked unguarded at server startup and per-request from
  `GET /api/config/status`.
  - Write a failing test: `readVscodeSettings` called with a path that
    exists per `existsSync` at check time but throws on read (simulate via
    a mock/stub, or a path deleted between check and read) returns the
    existing "not found" snapshot instead of throwing.
  - Wrap the `readFileSync`/`parseJsonc` calls in try/catch, returning
    `{ loggingEnabled: false, maxRetainedSessionLogs: null }` on failure —
    the same shape already used for "no settings path."
  - Verify server startup and `GET /api/config/status` no longer depend on
    the file being readable at the moment of the call (removes the
    `existsSync` TOCTOU gap as a side effect, since the read path alone now
    decides success/failure).

**Exit criterion**: both reads are exercised by a test proving they degrade
gracefully on a missing/unreadable/malicious-path input; `npm test` passes
for `packages/server`.

**Dependencies**: none — can start immediately, in parallel with nothing
else in this plan.

## Phase B — Correctness bugs (user-visible)

**Goal**: fix the four bugs users can actually hit today in Analyze mode.

- **B1. Show a real turn count on Analyze-mode session cards** (finding #3).
  `buildSessionSummary` (`session-enricher.ts:143-153`) always sets
  `turns: []` since `GET /api/sessions` intentionally omits turn data
  (architecture.md:348), but `SessionList.tsx:71` renders
  `{session.turns.length} turns` regardless, so every card reads "0 turns."
  - Write a failing test: the `Session` summary type gains a `turnCount:
    number` field distinct from `turns`, populated from the SQLite row's
    turn count without a per-session join (`listSessionRows` already has
    enough to compute or fetch this cheaply — confirm during implementation
    whether a `COUNT` column or existing row field covers it).
  - Update `SessionList.tsx` to render `turnCount` instead of
    `turns.length`.
  - Update the `domain` zod schema/type for `Session` and Learn-mode
    fixtures accordingly so both modes stay on one shape.

- **B2. Gate "Tool calls this turn" on the data that's actually present**
  (finding #4). `App.tsx:83`'s `toolCallsAvailable` checks
  `session?.toolInventory?.length`, which is only populated when
  `main.jsonl` parses (`app.ts:205-209`) — but `turn.toolCalls` comes
  independently from SQLite `session_files` rows
  (`session-enricher.ts:62-96`) and can be populated even when
  `toolInventory` is empty.
  - Write a failing test: given a session with empty `toolInventory` but a
    turn with non-empty `toolCalls`, the panel renders the tool-call detail
    instead of "Tool-call detail unavailable."
  - Change the availability check to look at the selected turn's
    `toolCalls` (or an explicit per-turn availability flag) instead of the
    session-wide `toolInventory` length.

- **B3. Return a 500 instead of hanging on `GET /api/sessions/:id` errors**
  (finding #5). The async handler (`app.ts:171-227`) has no try/catch or
  `next(err)`; Express 4 doesn't auto-catch async rejections, so an error
  after `db` opens closes the DB via `finally` but never sends a response.
  - Write a failing test: forcing an error inside the handler (e.g. a
    corrupted turn row, or a `main.jsonl` read rejection) results in a 500
    response, not a hung/timed-out request.
  - Wrap the handler body in try/catch, respond `res.status(500).json(...)`
    on error, keep the existing `finally { db.close(); }`.

- **B4. Surface fetch failures in the UI instead of failing silently**
  (finding #6). None of `App.tsx`'s `fetch...().then(...)` chains (lines
  54-56, 60-63, 66-71, 73-75, 87) has a `.catch`, even though the
  `api-client` functions `throw` on non-OK responses — a 404/500 becomes a
  console-only unhandled rejection with stale UI.
  - Write a failing test (component/integration level) asserting a
    fetch-rejection surfaces a visible error state rather than leaving
    stale data displayed.
  - Add `.catch` handlers that set an error-state value consumed by the UI
    (a simple inline message is enough — no need for a new design-system
    component unless one already exists).

**Exit criterion**: each of B1-B4 has a passing regression test; manual
smoke test in the browser (per CLAUDE.md's "test the golden path" rule)
confirms Analyze-mode session cards show correct turn counts, tool-call
detail renders when `toolCalls` exist even without `main.jsonl`, a forced
server error returns a 500 with a visible UI error, and stale-data no
longer lingers after a failed fetch.

**Dependencies**: independent of Phase A; can run in parallel or right
after.

## Phase C — Correctness bugs (lower severity)

**Goal**: fix the remaining bugs that are real but lower-likelihood or
UX-polish rather than functional breakage.

- **C1. Fix the session-switch race condition** (finding #7). `App.tsx:87`
  (`fetchSession(picked.id).then(loadSession)`) has no request
  token/`AbortController`, so switching sessions quickly can let a slower
  earlier request overwrite a faster later one.
  - Write a failing test simulating two overlapping `fetchSession` calls
    resolving out of order; assert the displayed session always matches the
    most-recently-clicked one.
  - Add an `AbortController` (aborting the previous in-flight request on a
    new selection) or a monotonic request-id guard that ignores
    stale responses in `loadSession`.

- **C2. Make `setMode` a no-op when the mode is unchanged** (finding #8).
  `state/session-store.ts:19-24` clears the loaded session on every
  `setMode` call, but `SegmentedControl.onChange` fires even when
  re-clicking the already-active tab.
  - Write a failing test: calling `setMode` with the current mode leaves
    the loaded session/selected turn untouched.
  - Add an early return when the new mode equals the current mode.

- **C3. Fix the `main.jsonl` single-corrupted-line misclassification**
  (finding #9). `classifyEnvelopesAvailability`
  (`main-jsonl-reader.ts:144-151`) uses `rawLineCount > 1` as part of its
  `"logging-never-enabled"` vs. `"parse-failures"` boundary, misclassifying
  a file with exactly one corrupted line.
  - Write the missing boundary test: `rawLineCount === 1`, `envelopes.length
    === 0`, expect `"parse-failures"`.
  - Change the boundary to `rawLineCount >= 1`.

- **C4. Prefer the latest *known* model within a turn** (finding #10).
  `session-usage-spans.ts:64` always takes
  `requests[requests.length - 1].model`, which can be `"unknown"` even when
  an earlier request in the same turn had a real model.
  - Write a failing test: a turn with an earlier `llm_request` carrying a
    known model and a later one missing `attrs.model` should report the
    known model, not `"unknown"`.
  - Change the selection to the last request with a defined `model`,
    falling back to `"unknown"` only if none of the turn's requests have
    one.

**Exit criterion**: each of C1-C4 has a passing regression test; no
behavior change for the already-covered 0-raw-line and 4-raw-line cases in
C3.

**Dependencies**: independent of Phases A/B; lowest priority, do last among
the bug fixes.

## Phase D — Duplication / simplification cleanup

**Goal**: the structural cleanups the review flagged as lower-priority and
no user-facing impact — worth doing, but only once A-C are done, since they
touch the same files as several fixes above (doing them first would create
merge friction against the bug fixes).

- **D1. Extract a shared `getJson<T>` helper.** `getJson<T>` is duplicated
  verbatim across `api-client/sessions.ts` and `learn-scenarios.ts`, and
  reimplemented inline in `config-status.ts`. Add `api-client/http.ts`
  exporting one `getJson<T>`, used by all three call sites.

- **D2. Add a `TokenCount` "unavailable" factory to `packages/domain`.**
  The `{ known: false, reason }` shape is hand-written 4 times across
  `session-usage-spans.ts`, `system-prompt-breakdown.ts`, and
  `session-enricher.ts`. Export a constructor (e.g. `unavailableTokenCount
  (reason)`) from `domain` and replace all 4 call sites.

- **D3. Move `buildAnalyzeModeExtras` out of `app.ts`.**
  `app.ts:69-107` contains non-trivial business logic (artifact-source
  selection, orchestrating file reads, building two domain structures)
  directly in the Express route file, contradicting architecture.md:126.
  Move it into `services/session-enricher/` (or a new sibling service
  module, whichever matches its actual responsibility) alongside
  `buildSession`/`buildSessionSummary`; `app.ts` only calls it.

- **D4. Replace `buildSession`'s 8 positional parameters with a typed
  object.** `session-enricher.ts:155-164` has grown an ordering footgun
  across three phases. Introduce an `AnalyzeEnrichment`-shaped parameter
  object (the type already exists next to `AnalyzeModeExtras` in `app.ts`,
  post-D3 in its new home) and update the single call site in `app.ts`.

- **D5. Minor perf cleanups**, each independent and low-risk:
  - Cache the parsed `main.jsonl` per request lifecycle if profiling shows
    it matters (currently re-read/re-parsed on every `GET /api/sessions/:id`
    call) — confirm this is worth the complexity before adding caching;
    architecture.md doesn't currently call for it.
  - Pre-group `fileRows` by turn once in `buildToolCalls` instead of
    re-filtering the full array per turn (O(turns × fileRows) → O(turns +
    fileRows)).
  - Replace `[...envelopes].reverse().find(...)` in
    `buildAnalyzeModeExtras`/its D3 destination with a plain reverse
    `for` loop or `findLast` (Node 22 supports `Array.prototype.findLast`)
    to avoid copying the whole array just to search from the end.

**Exit criterion**: existing test suite still passes with no behavior
change (these are refactors, not fixes — no new test cases required beyond
what D1-D4's moved code already had); `npm run lint` and `npm run build`
clean across all three workspaces.

**Dependencies**: Phases A-C (touches the same files; sequencing after
avoids rebase churn).

## Tracking

Each phase's exit criterion should be met and its changes committed before
starting the next phase, consistent with CLAUDE.md's "commit as soon as a
phase's exit criterion is met" rule. Findings #1 and #2 (Phase A) are the
highest priority per the original review, since they violate the project's
own explicit §11.2 security constraint; #3 and #4 (Phase B) are the most
visible functional bugs.
