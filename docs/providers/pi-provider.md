# pi coding-agent LogProvider — working notes

Internal engineering summary of the `PiAgentLogProvider`, kept alongside the
authoritative description in
[architecture.md §6.2.5](../architecture.md#625-pi-agent-provider-flow).
This doc exists to speed up the *next* round of work on this provider —
what it does, where the code lives, what changed most recently, and what's
still open.

## What it is

A third `LogProvider` (alongside VS Code and mitmproxy) that reads the
[pi coding agent](https://pi.dev)'s own JSONL session format directly —
`~/.pi/agent/sessions/--<cwd-with-slashes-as-dashes>--/<timestamp>_<uuid>.jsonl`
— with no OS-level store dependency and no vendor wire-protocol decoding,
since pi already normalizes token usage per message.

pi sessions are a **branchable tree** (fork/rewind create sibling entries
sharing an ancestor), not a linear history. Because `Session.turns` must
stay a flat array, the provider produces one `Session` per leaf branch —
the same "one file → N sessions" precedent as the mitmproxy provider's
idle-gap split.

## Code map

| File | Role |
|---|---|
| [pi-agent-log-provider.ts](../../packages/server/src/data-sources/pi-agent/pi-agent-log-provider.ts) | The `LogProvider` implementation — `listSessions`, `readSession`, `readTurnDetail`, `checkAvailability` |
| [pi-jsonl-reader.ts](../../packages/server/src/data-sources/pi-agent/pi-jsonl-reader.ts) | Parses raw JSONL lines into `PiSessionHeader` / `PiRawEntry` |
| [session-tree.ts](../../packages/server/src/data-sources/pi-agent/session-tree.ts) | `findLeafEntryIds` / `walkBranch` — tree reconstruction from `parentId` links |
| [session-id.ts](../../packages/server/src/data-sources/pi-agent/session-id.ts) | `computePiFileHash` / `computeBranchSessionId` — session IDs use a `__branch__` separator (pi's leaf ids are already uuids) |
| [turn-grouper.ts](../../packages/server/src/data-sources/pi-agent/turn-grouper.ts) | `groupBranchEntriesByUserMessage` — groups a branch into turns, mirroring the VS Code provider's grouping |
| [usage-extractor.ts](../../packages/server/src/data-sources/pi-agent/usage-extractor.ts) | Sums `AssistantMessage.usage` per turn into `uncachedInput`/`output`/`cacheRead`/`cacheWrite`; also extracts tool calls |
| [pi-message.ts](../../packages/server/src/data-sources/pi-agent/pi-message.ts) | Type guards/accessors for pi's message shapes (`PiAssistantMessage`, `PiToolResultMessage`, `PiToolCallBlock`) |
| [turn-inspector-builder.ts](../../packages/server/src/data-sources/pi-agent/turn-inspector-builder.ts) | Builds `TurnInspectorDetail` from a turn's raw entries (Analyze-mode drill-down) |
| [resolve-pi-agent-sessions-dir.ts](../../packages/server/src/platform/pi-agent-paths/resolve-pi-agent-sessions-dir.ts) | Locates `~/.pi/agent/sessions/` and lists session files for the current cwd |
| `packages/server/fixtures/pi-agent/*.jsonl` | Test fixtures: `normal-session`, `forked-session`, `malformed-lines-session`, `no-usage-session` |

Each `.ts` above has a matching `.test.ts` (TDD-first, per `architecture.md`
§11.4); `pi-agent-log-provider.test.ts` also runs the shared
`describeLogProviderContract` conformance suite.

## System prompt / tool inventory: not supported, by design

Unlike `VscodeLogProvider`, this provider never populates
`Session.systemPrompt` or `Session.toolInventory` — both stay `[]`. This is
a permanent, deliberate choice (architecture.md §6.2.5), not a gap pending
real-data verification: pi's JSONL format has no equivalent of VS Code's
captured `system_prompt_N.json`/`tools_N.json` artifact files, so there is
nothing to extract. This is the same precedent already set for the
mitmproxy provider.

Knock-on effects in the UI for pi sessions:

- `components/SystemPromptBreakdown` renders its empty state (no meter
  rows) — as of the most recent change below, with copy that correctly
  says this provider doesn't capture a system-prompt artifact, rather than
  the VS Code-specific "enable `agentDebugLog.fileLogging.enabled`" hint.
- Its "Open system prompt inspector" button never renders (it's gated on a
  `built-in` component being present, which pi sessions never have), so
  `components/SystemPromptInspector`'s full-page raw-text view is
  unreachable for pi sessions. This is consistent with `GET
  /api/sessions/:id/system-prompt` itself being wired directly to the VS
  Code `main.jsonl` artifact path rather than the generic `LogProvider`
  contract (`app.ts`'s comment on that route) — there would be nothing for
  it to return for a pi session id even if the button did appear.
- `components/ToolInventoryPanel` renders empty for the same reason.

If pi ever exposes its own system-prompt/tool-definition artifact, adding
support means: populating `Session.systemPrompt`/`toolInventory` in
`pi-agent-log-provider.ts` (mirroring `system-prompt-breakdown.ts`'s
`buildSystemPromptBreakdown`), and deciding whether `GET
/api/sessions/:id/system-prompt` should grow a provider-generic path or
stay VS-Code-only with a separate pi-specific route.

## Most recent change (2026-09-02, ~23:29 UTC)

Bug report: the "System prompt" tab showed a confusing empty state for pi
sessions — the fallback message told the user to "enable
agentDebugLog.fileLogging.enabled and reload VS Code," which is a VS Code
setting that doesn't apply to pi (or mitmproxy) sessions at all. Per
architecture.md §6.2.5, pi has no system-prompt artifact to capture in the
first place, so `Session.systemPrompt` is always `[]` for this provider —
that part is correct, working-as-designed behavior. The bug was purely in
`SystemPromptBreakdown`'s copy for that empty state, not in the provider.

Fix: `SystemPromptBreakdown` now takes an optional `providerId` prop (wired
from `session.providerId` in `App.tsx`) and shows a provider-neutral message
("This provider does not capture a system-prompt artifact...") for any
non-`vscode` session, keeping the VS Code-specific hint only for
`providerId: "vscode"` (or omitted, matching Learn mode/legacy callers).

- [SystemPromptBreakdown.test.tsx](../../packages/web/src/components/SystemPromptBreakdown.test.tsx) —
  new cases for `providerId="pi-agent"`/`"mitmproxy"` vs `"vscode"`/omitted
- [SystemPromptBreakdown.tsx](../../packages/web/src/components/SystemPromptBreakdown.tsx) —
  the `providerId`-branched empty-state message
- [App.tsx](../../packages/web/src/App.tsx) — passes `session?.providerId` through

## Previous change (2026-09-02, ~20:59–21:01 UTC)

Request: order pi sessions most-recent-first in the app, matching how
Copilot/VS Code sessions are already ordered (`ORDER BY updated_at DESC` in
`session-store.ts`'s `listSessionRows`) — pi sessions were previously
returned in file/branch discovery order, not sorted by recency.

TDD-first fix (test added and failing before the implementation change):

- [pi-agent-log-provider.test.ts:50-57](../../packages/server/src/data-sources/pi-agent/pi-agent-log-provider.test.ts#L50-L57) —
  `"lists sessions ordered from most recent to oldest by startedAt"`
- [pi-agent-log-provider.ts:191-201](../../packages/server/src/data-sources/pi-agent/pi-agent-log-provider.ts#L191-L201) —
  `listSessions()` now appends
  `.sort((a, b) => (b.startedAt ?? "").localeCompare(a.startedAt ?? ""))`
  after flattening per-file sessions.

Full server test suite was run after the change: the 21 pi-agent tests pass;
the only failures are the 13 pre-existing `app.test.ts` mitm-contamination
failures (see memory `project_mitm_app_test_contamination`), confirmed
unrelated. **This change is uncommitted on `main` as of this writing.**

## Open items (pending real-data verification)

Per architecture.md §6.2.5, this provider was built from pi's *published
docs schema* (`https://pi.dev/docs/latest/session-format`), not yet pinned
against a real, redacted captured session — the project's usual
verify-against-real-data discipline (constraint 5/§11.4) is still
outstanding here. Concretely, until a real capture is obtained:

- `tool`, `vision`, `reasoning` token counts stay permanently
  `{ known: false }` — no confirmed field separates them from
  `output`/`input` in the documented `usage` shape.
- `costAiCredits` (per-turn and session-level) stays permanently
  `{ known: false }` — AI Credits is Copilot's own billing unit with no
  defined conversion for pi's own cost figures (may never be resolvable).
- `turn-inspector-builder.ts`'s content-block field names
  (`text`/`content` on text/thinking blocks, `id`/`name`/`args` on
  `toolCall` blocks) are inferred from docs, not confirmed.
- Fork vs. rewind is approximate: any turn following a tree branch point is
  tagged `triggeredEvent: "fork"`; a real `branch_summary` entry's more
  specific intent isn't distinguished yet.

**Next step for real-data verification:** obtain one redacted real
`~/.pi/agent/sessions/**/*.jsonl` capture, diff its actual field names
against the fixtures in `packages/server/fixtures/pi-agent/`, and update the
extractors + this doc + architecture.md §6.2.5 together once confirmed.
