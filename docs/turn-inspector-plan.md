# Phase 9.5 implementation plan: turn request/response inspector

Written in response to [issue #10](https://github.com/raulkivi/gh-cp-chat-analyser/issues/10).
This document supersedes the earlier design proposal of the same content:
§§1-4 below are unchanged investigation/analysis, §6's open questions have
been answered (2026-08-10, by @raulkivi), and this document now carries an
implementation-ready contract + module-by-module TDD sequence, following
this repo's phase-writeup convention
([phase-9-log-providers-implementation.md](phase-9-log-providers-implementation.md)
is the model: investigation → resolved decisions → contracts → TDD
sequence → fixtures → code locations → exit criterion → out of scope).

## 1. What's being asked for

> In similar way as is implemented system prompt inspector must be possible
> to inspect every turn request and response. Turn inspector should show
> only content added by this turn. Large text files and image files should
> be replaced with placeholders e.g. file name with path and size.

So: a per-turn analog of `SystemPromptInspector` (architecture.md §4.2) —
today that component drills into the *session-level* system prompt; this
drills into one *turn's* actual LLM request payload and the model's
response, scoped to what that specific turn added rather than the full
accumulated conversation history.

## 2. What data actually exists for this (investigated against real logs)

`Turn` (architecture.md §5) already declares `userMessage: string` and
`assistantResponse: string`, populated today from SQLite's `turns.user_message`/
`turns.assistant_response` columns
(`packages/server/src/services/session-enricher/session-enricher.ts:176-177`).
**These are never rendered anywhere in the UI right now** —
`ExplanationPanel.tsx` shows `turn.explanation` and a tool-call summary, but
never `turn.userMessage`/`turn.assistantResponse`. That's the closest
existing analog to "turn response," and it's already wired into the domain
model and API response — just not surfaced.

But SQLite's `user_message`/`assistant_response` are Copilot Chat's own
persisted summaries, not necessarily the literal wire payload sent to/from
the model. The literal request/response — what the issue is actually asking
for — lives in `main.jsonl`, in event types this adapter currently parses
structurally but **discards the content of**:

| Event type | Field(s) with real content | Currently read? |
|---|---|---|
| `user_message` | `attrs.content` — the user's message text | No — stripped at parse time |
| `llm_request` | `attrs.userRequest`, `attrs.inputMessages` — the actual request payload sent to the model | No — stripped |
| `agent_response` | `attrs.response`, `attrs.reasoning` — the model's reply text and (when present) reasoning/thinking content | No — stripped |
| `tool_call` | `attrs.args`, `attrs.result` — what the tool was called with and what it returned | No — stripped |

"Stripped at parse time" is deliberate, current behavior:
`main-jsonl-reader.ts`'s `KNOWN_ATTRS_KEYS` allow-list
(`packages/server/src/data-sources/jsonl/main-jsonl-reader.ts:28-38`) only
keeps `inputTokens`/`outputTokens`/`cachedTokens`/`copilotUsageNanoAiu`/
`model`/`responseId`/`systemPromptFile`/`toolsFile`/`details` — every one of
the fields in the table above gets dropped by `projectAttrs` before the
envelope array is ever handed to an extractor. This allow-list is the fix
for the 2026-08-08 code/security review's **high** finding (architecture.md
§6.2.2's "medium security-review fix" note): before it existed, the reader
held every envelope's full, undocumented `attrs` payload — including raw
prompt/tool-call content — in memory for the whole session, unbounded. §4
below returns to this directly, because building a turn inspector means
deliberately re-introducing exactly the class of data that fix removed, and
the design has to do that without reintroducing the unbounded-memory
problem. Keep `KNOWN_ATTRS_KEYS` and its whole-session read path completely
unchanged (§4/§7 below add a second, separate, on-demand path instead of
widening it).

**Confirmed from a real, redacted fixture**
(`packages/server/fixtures/jsonl/real-session-with-usage.jsonl`): a single
SQLite turn can contain **more than one** `llm_request`/`agent_response`
round-trip — architecture.md §6.2.2 already documents this (the agent
looping through tool calls before producing a final answer) and
`groupEnvelopesByUserMessage` already joins everything between one
`user_message` and the next to one SQLite `turn_index`. The fixture's
`requestShape.messageCount` also confirms `inputMessages` accumulates the
*entire* conversation so far, growing by 2 each turn (1 → 3 → 5 → 7) — so
naively showing `inputMessages` verbatim on turn 4 would dump turns 1-3's
messages again. This is the concrete mechanism behind "show only content
added by this turn."

## 3. What "content added by this turn" has to mean, precisely

Given the confirmed shape above, a turn's request/response content is not
one clean request/response pair — it's a **sequence of round-trips**:

```
user_message                     ← the new content the user typed
  [discovery/generic events]     ← already surfaced via SystemPromptBreakdown, not part of this
  tool_call → tool_call → ...    ← 0+ tool invocations (already partly modeled as Turn.toolCalls)
  llm_request                    ← round-trip 1: full accumulated history + system prompt + tools
  agent_response                 ← round-trip 1's reply (may itself trigger more tool calls)
  tool_call → ...
  llm_request                    ← round-trip 2: previous round's messages + new tool results
  agent_response                 ← round-trip 2's reply (final, if no further tool calls)
turn_end
```

Rule: for each `llm_request` in the turn, the "added content" is the
**suffix of `inputMessages` beyond what the previous `llm_request` in the
same turn already contained** (or, for the turn's first `llm_request`,
beyond what the *previous turn's last* `llm_request` contained). Concretely:
diff `inputMessages[prevLength:]` rather than re-parsing message contents to
guess what's new — the array only ever grows, per the `messageCount`
evidence above, so a length-based suffix is exact and doesn't require
understanding the message format. The very first turn's very first request
has no predecessor, so its entire `inputMessages` (system prompt excluded —
that's already `SystemPromptInspector`'s job) counts as "added."

This diffing rule is specific to `main.jsonl`'s `inputMessages` growth
invariant. §5.5 below covers why the mitmproxy provider doesn't (and
can't, in general) apply the same diff.

## 4. The memory/security constraint this has to respect

`readMainJsonlFile` currently loads a session's *entire* `main.jsonl` into
memory as an envelope array once per `GET /api/sessions/:id` call
(architecture.md §6.2.2, §13's open "per-turn lazy loading vs. whole-session
payloads" question — still open, noted there as unresolved). That's
tolerable today because every envelope is trimmed down to a handful of
scalar fields via `KNOWN_ATTRS_KEYS`. Widening that allow-list to include
`inputMessages`/`userRequest`/`response`/`reasoning`/`args`/`result` for
*every* envelope, for *every* session-list/session-detail request, would
reintroduce the exact high-severity finding the Phase 6 fix closed — full
raw prompt/tool-result payloads (which can be arbitrarily large: file
contents, terminal output, images) held in memory for sessions nobody asked
to inspect at that granularity.

**Resolution**: keep `KNOWN_ATTRS_KEYS` exactly as it is for the existing
whole-session read path. Add a **second, separate, on-demand** read path —
used only when a user explicitly opens the turn inspector for one specific
turn — that streams `main.jsonl` again (cheap: local file, already-proven
streaming reader) and this time keeps the wide-content fields, but **only
for the envelopes belonging to the requested turn's `user_message`-to-
`user_message` span** (the same positional grouping
`groupEnvelopesByUserMessage` already computes), stopping the stream once
that span ends rather than reading the rest of the file. This mirrors the
pattern architecture.md §8 already reserves for exactly this situation:
`GET /api/sessions/:id/turns/:turnIndex` is documented ("used for on-demand
deep dives, avoiding sending every turn's full detail up front") but has
never been implemented. This plan is that endpoint's actual use case — see
§6/§7 below.

## 5. Design

### 5.1 Domain model addition

A new type, deliberately *not* a field on `Turn` itself (so the existing
`GET /api/sessions/:id` payload — already sent for every turn up front —
doesn't grow to include this heavy content by default, keeping with §11.1's
"start simple, add pagination if profiling shows it's needed" and the
lazy-loading intent above). New file `packages/domain/src/turn-inspector.ts`:

```ts
type ContentPlaceholder = {
  placeholder: true;
  kind: "file" | "image";
  path?: string;      // when known (e.g. a tool arg naming a file)
  sizeBytes?: number;
};

type MessageContentPart =
  | { kind: "text"; text: string }
  | ContentPlaceholder;

interface TurnRequestRound {
  index: number;                       // round-trip index within the turn (0-based)
  addedMessages: MessageContentPart[]; // this round's slice of inputMessages — see §3
  toolCalls: { name: string; args: MessageContentPart[]; result: MessageContentPart[] }[];
}

interface TurnResponseRound {
  index: number;
  response: MessageContentPart[];
  reasoning?: MessageContentPart[];    // present only when the request captured reasoning content
}

interface TurnInspectorDetail {
  turnIndex: number;
  userMessage: MessageContentPart[];   // the turn's own new user message
  rounds: { request: TurnRequestRound; response: TurnResponseRound }[];
}
```

`MessageContentPart` (rather than a plain string) is what makes the
placeholder requirement structural instead of a display-layer regex hack:
the server decides, per part, whether it's inline text or a placeholder,
and the client only ever renders what it's given. `rounds: []` is a valid,
non-error value (§6 decision 4) — it means this turn genuinely made no
model request, not that data is missing.

### 5.2 Placeholder detection

"Large text files and image files should be replaced with placeholders"
needs a concrete rule, since neither `main.jsonl`'s `tool_call.attrs.args`/
`.result` nor `llm_request.attrs.inputMessages` have a documented, stable
schema (architecture.md §7's whole reason the extractor registry exists).
Lives in a new **provider-neutral** module (used by both the VS Code and
mitmproxy paths — see §7's module list),
`packages/server/src/data-sources/log-providers/build-content-parts.ts`.
Two independent signals, in order:

1. **Size-based, always applied**: any string content part over
   `PLACEHOLDER_THRESHOLD_CHARS = 2000` (a named, exported constant — §6
   decision 6) becomes `{ kind: "file", sizeBytes: <byte length> }`
   regardless of what produced it — the safety net that guarantees the
   inspector can never dump an enormous blob into the browser tab
   regardless of how the content was generated.
2. **Shape-based, where available**: a `tool_call` whose `name` is a known
   file-reading tool (`read_file` and similar — the existing tool inventory
   already tracks tool names) and whose `args`/`result` can be parsed enough
   to find a file path gets `path` populated on the placeholder even when
   under the size threshold, since "which file" is useful context the size
   rule alone can't give.
3. **Image detection, best-effort**: a `type: "image"` / base64-data-URI
   content part (matching common chat-message content-block conventions)
   becomes `{ kind: "image" }`. Not yet confirmed against a real capture —
   §6 decision 5 ships this as best-effort now rather than blocking on a
   fixture that may not exist.

### 5.3 Provider-neutral contract

§6 decision 1: `readTurnDetail` joins `checkAvailability`/`listSessions`/
`readSession` as a fourth required `LogProvider` method (architecture.md
§6.2.1), not an optional/provider-specific extension — both `VscodeLogProvider`
and `MitmproxyLogProvider` implement it in this phase.

```ts
interface LogProvider {
  // ...existing members unchanged...
  readTurnDetail(sessionId: string, turnIndex: number): Promise<TurnInspectorDetail | null>;
}
```

`null` has exactly one meaning, matching `readSession`'s existing
null-for-404 convention precisely: the session or the turn index doesn't
exist. It does **not** mean "no round-trip data available" — that's a
valid, non-null `TurnInspectorDetail` with `rounds: []` (§6 decision 4).
This split means the API layer never has to guess which case it's in, and
the frontend already has the signal it needs to pick the right empty-state
copy for free: `Session.usageDataAvailable`, returned by the
`GET /api/sessions/:id` call the UI already made before the user could
click "Inspect request/response" at all. If that was `false`, the whole
session has no `main.jsonl` coverage and the UI shows the actionable
"enable `agentDebugLog.fileLogging.enabled`" copy locally, without needing
a distinct signal from this endpoint. If it was `true` and this endpoint
still returns `rounds: []` for a specific turn, that's decision 4's
genuinely-no-round-trip case, and the UI shows a different, non-actionable
message ("This turn made no request to the model.").

### 5.4 VS Code provider: bounded wide-attrs read

New module, `packages/server/src/data-sources/jsonl/turn-inspector-reader.ts`:

```ts
const WIDE_ATTRS_KEYS = [
  "content",       // user_message
  "userRequest", "inputMessages",  // llm_request
  "response", "reasoning",         // agent_response
  "args", "result",                // tool_call
] as const;

async function readMainJsonlEnvelopesForTurn(
  filePath: string,
  turnIndex: number,
): Promise<{ turnEnvelopes: JsonlEnvelope[]; previousInputMessagesLength: number } | null>
```

Streams the file with the same `readline`-based loop `readMainJsonlFile`
already uses, but through a **separate** attrs projector
(`WIDE_ATTRS_KEYS`, not `KNOWN_ATTRS_KEYS`) — refactor `parseEnvelopeLine`
to accept an `attrsProjector` parameter (defaulting to the existing narrow
`projectAttrs`) so both read paths share one line-parsing/JSON-shape
implementation and only differ in which `attrs` keys survive, rather than
duplicating the loop. Counts `user_message` envelopes while streaming to
find the target span's start, and while scanning through envelopes
*before* that span tracks only the **most recent** `llm_request`'s
`inputMessages.length` (discarding the previous one each time a newer
`llm_request` is seen) — this is the "previous turn's last `llm_request`"
baseline §3's diff rule needs, and it stays O(1) in memory regardless of
how many earlier turns exist, since only one number is ever retained.
Reading stops (stream closed) once the target span ends (the next
`user_message`, or EOF) — this, plus never buffering earlier turns'
envelope bodies, is what bounds this path to one turn's content in memory,
per §4. Returns `null` if `turnIndex` has no corresponding `user_message`
(out-of-range — the source of `readTurnDetail`'s null-for-404, §5.3).

New pure builder, `packages/server/src/data-sources/log-providers/vscode/turn-inspector-builder.ts`:
takes the isolated span + `previousInputMessagesLength` and produces a
`TurnInspectorDetail` — extracts `userMessage` from the span's
`user_message.attrs.content`; splits the span into rounds at each
`llm_request`/`agent_response` pair (tool calls between one
`agent_response` and the next `llm_request` belong to the round that
follows, matching §3's diagram); each round's `addedMessages` is
`inputMessages.slice(prevLength)`, where `prevLength` is the previous
round's `inputMessages.length` (or, for round 0, `previousInputMessagesLength`
from the reader); every string content part is run through
`build-content-parts.ts` (§5.2).

### 5.5 mitmproxy provider: single-round raw exchange

A HAR entry is already a complete, self-contained request/response pair —
unlike `main.jsonl`, there is no cross-request `inputMessages`-growth
invariant a mitmproxy capture is guaranteed to follow (that's a detail of
how a *client* structured its own conversation history, not something the
proxy layer can assume across arbitrary vendors/clients). So
`MitmproxyLogProvider.readTurnDetail` does **not** attempt §3's suffix-diff:
it re-reads the HAR file (already cheap and local, matching
`buildSessionFromFile`'s existing per-request cost), locates
`entries[turnIndex]` (`null` if out of range — HAR entries already map 1:1
to `Session.turns`, per `buildSessionFromFile`), and returns exactly **one**
round whose `addedMessages`/`response` are the full, pretty-printed
`requestBody`/`responseBody` from `harEntryToRawExchange` (already
redacted, already complete per `RawMitmExchange` — confirmed both fields
are full raw strings, not decoder-normalized summaries), each run through
`build-content-parts.ts` the same as the VS Code path. This intentionally
bypasses the `MitmExchangeDecoder` registry (§6.2.1) — decoders normalize
*usage*, discarding message content, which is exactly what this feature
needs back; re-deriving a decoder-level "added content" contract is out of
scope for this phase (§9). `toolCalls` stays `[]` for the mitmproxy round —
tool-call detail, if present, is already inside the raw body text shown in
full, not separately extracted.

### 5.6 API

```
GET /api/sessions/:id/turns/:turnIndex
```

Fills in the row architecture.md §8 already lists but has never
implemented. `turnIndex` is validated as a non-negative integer (400
otherwise, mirroring `sessionId`'s existing allow-list validation, §11.2).
Calls `registry.getActiveProvider().readTurnDetail(id, turnIndex)`; `null`
→ 404 `Unknown session or turn`; otherwise `res.json(detail)`; throw → 500,
matching every other route's existing pattern in `app.ts`.

### 5.7 UI

Reuse `SystemPromptInspector`'s established pattern rather than invent a
new one: a full-page view (replaces the 3-column layout, like the existing
inspector does) opened via a new "Inspect request/response" action next to
`ExplanationPanel`'s existing "Tool calls this turn" block
(`ExplanationPanel.tsx:13-67`), Analyze mode only (both providers now, per
§6 decision 1 — Learn mode sessions have no backing log source at all, so
never show the action). Layout: one `.blueprint` panel per round-trip
stacked vertically (§6 decision 3) rather than the system-prompt
inspector's fixed 3-pane grid, since round count is variable:

- Header: turn index, trigger tag (reusing `TRIGGER_LABELS`), back button —
  matching the existing inspector's header row exactly.
- Per round: a "Request" card (this round's added messages, tool calls made
  before it) and a "Response" card (the model's reply, and — per §6
  decision 2 — its reasoning inline underneath when present, no toggle)
  side by side, `whiteSpace: pre-wrap` text like the existing inspector's
  raw-text pane, with placeholders rendered as a distinct `Tag`-styled chip
  (`📄 path/to/file.ts · 14.2 KB`) instead of inline text.
- Empty state (§5.3): when `Session.usageDataAvailable` is already `false`,
  show the actionable "enable `agentDebugLog.fileLogging.enabled` and
  reload VS Code" copy without waiting on the fetch; when it's `true` but
  `rounds` comes back empty for this turn, show "This turn made no request
  to the model" instead — two distinct messages for two distinct, both
  legitimate, causes.

New `packages/web/src/api-client/sessions.ts` export:
`fetchTurnInspectorDetail(sessionId, turnIndex): Promise<TurnInspectorDetail>`.
New component `packages/web/src/components/TurnInspector.tsx`.

## 6. Resolved decisions (answers to the design proposal's open questions)

Decided 2026-08-10 with @raulkivi:

1. **Provider scope: `LogProvider`-neutral from the start.** `readTurnDetail`
   is part of the `LogProvider` interface (§5.3), implemented by both
   `VscodeLogProvider` and `MitmproxyLogProvider` in this same phase — not
   shipped VS Code-only first. See §5.5 for why the mitmproxy
   implementation is structurally simpler (one round, no diffing) rather
   than a smaller version of the VS Code one.
2. **Reasoning is shown by default**, inline in the Response card, whenever
   `agent_response.attrs.reasoning` (VS Code) is present — no toggle, no
   separate opt-in state to build.
3. **Per-round-trip detail**, not a merged view: one Request/Response card
   pair per round-trip (§3/§5.7), matching the literal "every turn request
   and response" ask and the raw log's actual structure.
4. **Zero-round turns are handled defensively, not treated as guaranteed
   impossible.** `rounds: []` is a valid, non-error `TurnInspectorDetail`
   (§5.1/§5.3) regardless of whether this case has been confirmed to occur
   in real data; the UI has a specific, non-actionable message for it
   (§5.7), distinct from the actionable "logging was never enabled" case.
5. **Image detection ships best-effort** (§5.2 point 3), since no real
   captured `inputMessages` payload with an image has been found on this
   machine to confirm the shape against. Tracked the same way as
   architecture.md §13's `path-scoped-instructions` gap: revisit with a
   real fixture if/when one surfaces, not guessed at further now.
6. **Placeholder threshold: 2000 characters**, a named exported constant
   (§5.2), tunable later without a design change.
7. **Phase placement: Phase 9.5**, inserted between Phase 9 (done — the
   `LogProvider` abstraction this plan builds directly against already
   exists) and Phase 10 (future, out of MVP scope) in
   [implementation-plan.md](implementation-plan.md), the same "inserted
   half-phase" pattern Phase 8.5 already used between Phases 8 and 9.

## 7. Module-by-module TDD sequence

Follow this order — each step's tests must fail against the previous step's
code before being made to pass, per constraint 11/§11.4:

1. **Domain schema** (`packages/domain/src/turn-inspector.ts`) — schema-
   validation test against a hand-written sample `TurnInspectorDetail`
   (including a placeholder part and a multi-round turn) before the zod
   schema/type exist.
2. **`build-content-parts.ts`** (§5.2, provider-neutral) — failing tests
   first: under-threshold string → text part; over-threshold string → file
   placeholder with correct `sizeBytes`; a known file-tool arg with a
   parseable path → `path` populated regardless of size; an unrecognized
   shape → best-effort text, never a throw.
3. **`LogProvider` contract suite extension** (`contract.test.ts`) — add
   `readTurnDetail` assertions (unknown `turnIndex` → `null`; a fixture
   turn with round-trip data → non-empty `rounds`) to the shared suite
   every provider is tested against, before either provider implements the
   method — same "write before either concrete provider exists" approach
   Phase 9's step 1 used.
4. **`turn-inspector-reader.ts`** (§5.4, bounded wide-attrs read + span
   isolation + previous-round baseline) — failing tests against the real
   `packages/server/fixtures/jsonl/real-session-with-usage.jsonl` fixture
   (already confirmed 3-round-trip, `messageCount` 1→3→5→7) before
   implementation.
5. **`turn-inspector-builder.ts`** (§5.4, envelopes → `TurnInspectorDetail`)
   — failing tests against the same fixture asserting each round's
   `addedMessages` length matches the expected diff from the known
   `messageCount` progression.
6. **`VscodeLogProvider.readTurnDetail`** wiring — failing test against the
   fixture for the full method, plus the null-for-unknown-turn and
   empty-`rounds`-for-no-coverage cases.
7. **`MitmproxyLogProvider.readTurnDetail`** (§5.5) — failing test against
   an existing HAR fixture (e.g. `anthropic-non-streamed.har`) asserting a
   single round with the full raw request/response body as text parts,
   before implementation.
8. **`GET /api/sessions/:id/turns/:turnIndex`** route — failing API test
   (200 against a real fixture session; 404 for an unknown session/turn;
   400 for a non-numeric `turnIndex`) before wiring.
9. **Frontend** — `api-client` fetch test → `TurnInspector.tsx` component
   tests (renders N round cards; placeholder chip rendering; reasoning
   shown inline; the two distinct empty-state messages per §5.7) →
   `ExplanationPanel`'s new trigger-button interaction test — each written
   failing before its implementation.

## 8. Fixtures needed

- `packages/server/fixtures/jsonl/real-session-with-usage.jsonl` (existing)
  is the primary VS Code fixture — already confirmed multi-round, no new
  file needed for the happy path.
- One new, small, hand-authored synthetic fixture for the zero-round-trips
  case (§6 decision 4) — a `user_message`/`turn_end` span with no
  `llm_request` in between.
- An existing mitmproxy HAR fixture (e.g. `anthropic-non-streamed.har`) for
  the mitmproxy `readTurnDetail` test — no new file needed.
- If a real image-bearing capture ever surfaces (§6 decision 5), add it
  then; not blocking this phase.

## 9. Where the code lives

- `packages/domain/src/turn-inspector.ts` — new.
- `packages/server/src/data-sources/log-providers/build-content-parts.ts` —
  new, provider-neutral (§5.2).
- `packages/server/src/data-sources/log-providers/log-provider.ts` —
  `readTurnDetail` added to the interface (§5.3).
- `packages/server/src/data-sources/jsonl/turn-inspector-reader.ts` — new
  (§5.4).
- `packages/server/src/data-sources/log-providers/vscode/turn-inspector-builder.ts`
  — new (§5.4).
- `packages/server/src/data-sources/log-providers/vscode/vscode-log-provider.ts`
  — gains `readTurnDetail`.
- `packages/server/src/data-sources/log-providers/mitmproxy/mitmproxy-log-provider.ts`
  — gains `readTurnDetail` (§5.5).
- `packages/server/src/app.ts` — new route (§5.6).
- `packages/web/src/api-client/sessions.ts`,
  `packages/web/src/components/TurnInspector.tsx`,
  `packages/web/src/components/ExplanationPanel.tsx` (new trigger button).

## 10. Exit criterion

Opening the inspector for a real multi-round Analyze-mode turn, on either
provider, shows one Request/Response card pair per round-trip, with
reasoning rendered inline when present, and any content over 2000
characters (or a recognized file-tool arg/result) rendered as a placeholder
chip instead of the raw text. A turn with no captured round-trip data shows
the correct one of the two empty-state messages depending on whether the
whole session or just that turn lacks coverage. Switching the active
provider and opening the inspector on a mitmproxy session works through the
same `TurnInspector` component with no provider-specific branching in the
frontend — the same OCP proof pattern Phase 9's registry test already
established for provider addition.

## 11. Explicitly out of scope for this phase

- Image-attachment placeholder detection beyond best-effort (§6 decision 5)
  until a real fixture exists.
- mitmproxy multi-round-trip modeling or cross-request diffing (§5.5) — each
  HAR entry is one round, full stop; no attempt to infer conversation
  history growth across entries.
- Any change to `GET /api/sessions`/`GET /api/sessions/:id`'s existing
  response shape — this phase is additive only, per §5.1's "not a field on
  `Turn`" decision.
- Updating architecture.md §8's endpoint description and the Analyze-mode
  component table (§4.2) to reflect the real `TurnInspectorDetail` shape —
  deferred to when this phase actually ships, matching every other phase's
  pattern of updating architecture.md alongside the code that makes it
  true, not at plan time.
