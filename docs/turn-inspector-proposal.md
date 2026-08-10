# Proposal: turn request/response inspector

Written in response to [issue #10](https://github.com/raulkivi/gh-cp-chat-analyser/issues/10).
This is a **design proposal**, not an implementation — per this repo's
convention of one doc per concern (see
[log-provider-alternatives.md](log-provider-alternatives.md) and
[phase-9-log-providers-implementation.md](phase-9-log-providers-implementation.md)
for the same pattern), it lays out what data is actually available, the
design tension that has to be resolved before writing code, a proposed
shape, and the questions that need an answer from @raulkivi before this
becomes a phase in [implementation-plan.md](implementation-plan.md).

## 1. What's being asked for

> In similar way as is implemented system prompt inspector must be possible
> to inspect every turn request and response. Turn inspector should show
> only content added by this turn. Large text files and image files should
> be replaced with placeholders e.g. file name with path and size.

So: a per-turn analog of `SystemPromptInspector` (architecture.md §4.2) —
today that component drills into the *session-level* system prompt; this
would drill into one *turn's* actual LLM request payload and the model's
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
problem.

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

Proposed rule: for each `llm_request` in the turn, the "added content" is
the **suffix of `inputMessages` beyond what the previous `llm_request` in
the same turn already contained** (or, for the turn's first `llm_request`,
beyond what the *previous turn's last* `llm_request` contained). Concretely:
diff `inputMessages[prevLength:]` rather than re-parsing message contents to
guess what's new — the array only ever grows, per the `messageCount`
evidence above, so a length-based suffix is exact and doesn't require
understanding the message format. The very first turn's very first request
has no predecessor, so its entire `inputMessages` (system prompt excluded —
that's already `SystemPromptInspector`'s job) counts as "added."

This still leaves one real design choice — see Q3 in §5.

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

**Proposed resolution**: keep `KNOWN_ATTRS_KEYS` exactly as it is for the
existing whole-session read path. Add a **second, separate, on-demand**
read path — used only when a user explicitly opens the turn inspector for
one specific turn — that streams `main.jsonl` again (cheap: local file,
already-proven streaming reader) and this time keeps the wide-content
fields, but **only for the envelopes belonging to the requested turn's
`user_message`-to-`user_message` span** (the same positional grouping
`groupEnvelopesByUserMessage` already computes). This mirrors the pattern
architecture.md §8 already reserves for exactly this situation:
`GET /api/sessions/:id/turns/:turnIndex` is documented ("used for on-demand
deep dives, avoiding sending every turn's full detail up front") but has
never been implemented — grep confirms no route or handler exists yet. This
proposal is that endpoint's actual use case.

## 5. Proposed design

### 5.1 Domain model addition

A new type, deliberately *not* a field on `Turn` itself (so the existing
`GET /api/sessions/:id` payload — already sent for every turn up front —
doesn't grow to include this heavy content by default, keeping with
constraint/§11.1's "start simple, add pagination if profiling shows it's
needed" and the lazy-loading intent above):

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
and the client only ever renders what it's given.

### 5.2 Placeholder detection

"Large text files and image files should be replaced with placeholders"
needs a concrete rule, since neither `main.jsonl`'s `tool_call.attrs.args`/
`.result` nor `llm_request.attrs.inputMessages` have a documented, stable
schema (architecture.md §7's whole reason the extractor registry exists).
Two independent signals, in order:

1. **Size-based, always applied**: any string content part over a threshold
   (proposed: 2000 characters, roughly matching the "large" framing and
   cheap to tune later) becomes `{ kind: "file", sizeBytes: <byte length> }`
   regardless of what produced it — this is the safety net that guarantees
   the inspector can never dump an enormous blob into the browser tab
   regardless of how the content was generated.
2. **Shape-based, where available**: a `tool_call` whose `name` is a known
   file-reading tool (`read_file` and similar — the existing tool inventory
   already tracks tool names) and whose `args`/`result` can be parsed enough
   to find a file path gets `path` populated on the placeholder even when
   under the size threshold, since "which file" is useful context the size
   rule alone can't give.
3. Image detection: look for the same signal Copilot Chat's own
   `inputMessages` content-part shape would use (a `type: "image"` /
   base64-data-URI content part, matching common chat-message content-block
   conventions) — flagged as **not yet confirmed against a real capture**;
   see Q4.

### 5.3 API

New endpoint, filling in the one architecture.md §8 already lists but never
implemented:

```
GET /api/sessions/:id/turns/:turnIndex
```

Returns `TurnInspectorDetail` (or 404 if the turn has no `main.jsonl`
coverage — same `usageDataAvailable`-style honesty as every other gap,
constraint 6). Analyze mode (VS Code provider) only for v1 — see Q6 on
mitmproxy/Learn mode.

### 5.4 UI

Reuse `SystemPromptInspector`'s established pattern rather than invent a
new one: a full-page view (replaces the 3-column layout, like the existing
inspector does) opened via a new "Inspect request/response" action next to
`ExplanationPanel`'s existing "Tool calls this turn" block
(`ExplanationPanel.tsx:13-67`). Layout sketch, one `.blueprint` panel per
round-trip stacked vertically (a turn can have several, per §3) rather than
the system-prompt inspector's fixed 3-pane grid, since round count is
variable and a fixed 3-pane layout doesn't have a natural place to put N of
them:

- Header: turn index, trigger tag (reusing `TRIGGER_LABELS`), back button —
  matching the existing inspector's header row exactly.
- Per round: a "Request" card (this round's added messages, tool calls made
  before it) and a "Response" card (the model's reply, reasoning if
  present) side by side, `whiteSpace: pre-wrap` text like the existing
  inspector's raw-text pane, with placeholders rendered as a distinct
  `Tag`-styled chip (`📄 path/to/file.ts · 14.2 KB`) instead of inline text.
- Empty/unavailable state matching the existing inspector's
  `state.status === "error"` pattern: "No request/response content captured
  for this turn — enable agentDebugLog.fileLogging.enabled and reload VS
  Code," reusing the same actionable-reason convention as every other gap
  in this app (constraint 6/8).

## 6. Open clarification questions

1. **Scope of "response" — text only, or reasoning/thinking too?**
   `agent_response.attrs.reasoning` exists in the real fixture (present on
   2 of 3 responses, absent on the third — possibly a per-request toggle,
   matching the "Toggling extended thinking" Learn scenario). Should the
   inspector show reasoning content by default, behind a toggle, or not at
   all? (Showing it seems clearly in scope given the ask, but it's worth
   confirming since reasoning content is often the largest single field.)

2. **Per-round-trip detail, or one merged view per turn?** §3/§5.4 propose
   showing every `llm_request`/`agent_response` round-trip within a turn
   separately (since a turn can contain several tool-call loops). An
   alternative is a single merged "here's everything this turn added"
   view that flattens all rounds together. The per-round view is more
   literally "every turn request and response" (plural) and matches what
   the raw log actually contains, but is more UI surface to build. Which
   is wanted?

3. **When a turn has zero `llm_request` rounds** (e.g., a turn whose only
   effect was a slash command or a tool call with no model round-trip —
   do those exist in this app's data? Not yet confirmed against a real
   capture) — should the inspector show an empty state, or is this
   guaranteed not to happen given how `turn_start`/`turn_end` are emitted?

4. **Image detection** (§5.2 point 3) is proposed but not yet confirmed
   against a real captured `inputMessages` payload containing an image —
   this project's own session history may not have attached one. Is there
   a known real session with an image attachment to capture as a fixture
   before committing to the detection shape? Without one, this ships as
   "best-effort, revisit once a real example exists" like the
   `path-scoped-instructions` gap in architecture.md §13.

5. **Placeholder size threshold** (§5.2 point 1 proposes 2000 characters) —
   any preference, or is "small enough to read in the panel, large enough
   to not placeholder every normal message" an acceptable heuristic to
   pick during implementation and tune later?

6. **Provider scope**: should this ship for the VS Code provider only
   (this proposal's assumption, since `main.jsonl` is the only source
   investigated here), or does it need to be designed as a
   `LogProvider`-neutral contract from the start so Phase 9's mitmproxy
   provider (which captures full HTTP request/response bodies already —
   arguably an *easier* source for this feature than `main.jsonl`) can
   implement it too? If the latter, this should probably fold into
   [phase-9-log-providers-implementation.md](phase-9-log-providers-implementation.md)
   instead of shipping standalone first.

7. **Phase placement**: assuming VS Code-only scope, this looks like a
   direct successor to Phase 6's `SystemPromptInspector` addendum — same
   component pattern, same `main.jsonl` source, same on-demand-fetch shape.
   Should it land as another Phase 6 addendum (before Phase 9), or wait
   until after Phase 9's `LogProvider` refactor so it's built against
   `VscodeLogProvider` directly instead of against `app.ts`'s current
   direct-wired path (which Phase 9 is already planning to retire per
   architecture.md §6.2.2's "planned refactor" note)?

Once these are answered, the next step is a normal implementation-plan.md
phase entry (TDD order: fixture capture for a real multi-round turn and,
if available, a real image attachment → failing extractor test → failing
endpoint test → failing component test → implementation), following this
repo's existing phase-writeup convention.
