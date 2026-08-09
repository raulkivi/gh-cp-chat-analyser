# Phase 9 implementation plan: extensible log providers

This document turns [implementation-plan.md](implementation-plan.md)'s Phase
9 goal and exit criterion into an actionable build plan. It assumes
[architecture.md §2 constraint 12](architecture.md), §4.1's `log-providers`
modules, §6.2.1's `LogProvider` boundary, and §6.2.3's mitmproxy sequence
diagram, which this change updated alongside this document. Read those
sections first; this document does not repeat their contracts, only extends
them to implementation-ready detail.

It opens with the critical review that produced the decisions below, then
lays out contracts, module-by-module TDD steps, fixtures, and rollout.

## 1. Critical review of the 2026-08-09 log-provider requirements

The three commits that introduced provider-extensible ingestion (`docs:
design extensible log providers`, `docs: require architecture diagrams`,
`docs: diagram log provider architecture`) are architecturally sound — the
provider boundary is drawn in the right place, and OCP/LSP are argued for
specifically rather than asserted. The review below is what was missing
before this document filled it in; each item states what's now resolved and
where.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | **mitmproxy's native capture format can't be read from this stack.** `.mitm` flow files are mitmproxy's own Python-internal serialization (no maintained Node.js/TypeScript parser exists). The requirements say "reads local mitmproxy capture files" without naming a format, and the tech stack (§9) is Node.js-only with no Python subprocess dependency. Shelling out to mitmproxy's own CLI to read them would add an external-binary dependency and a new command-execution surface. | High — blocks implementation entirely as written | §2 below: standardize on mitmproxy's built-in **HAR export** (`hardump`), a documented JSON format parseable with `JSON.parse`, no new runtime dependency. |
| 2 | **No session boundary is defined for mitmproxy.** VS Code sessions map 1:1 onto SQLite rows; a HAR capture is just a flat list of request/response entries with no session id. Guessing a boundary (e.g. an idle-gap heuristic) risks silently mis-grouping turns, which constraint 6's "never fabricate" spirit should also cover. | High — `LogProvider.listSessions()` can't be implemented without this | §3 below: one capture file = one session for the MVP; idle-gap grouping recorded as a §13 open question, not guessed at now. |
| 3 | **§3's system diagram and constraint 1 didn't reflect provider-extensibility**, contradicting the very "keep diagrams current" rule added in the same doc round (`.github/copilot-instructions.md`). Constraint 1 still said "only... SQLite... and `main.jsonl`," directly contradicting the new constraint 12 three paragraphs later. | Medium — self-contradicting source-of-truth doc | Fixed directly in `architecture.md` in this change: §3 diagram now shows the provider registry/mitmproxy path; constraint 1 mentions mitmproxy captures. |
| 4 | **No sequence diagram existed for the mitmproxy flow**, unlike the VS Code path (§6.2.2) — another gap against the same new diagram rule, since ingestion-flow diagrams are explicitly required per workflow. | Medium | Added §6.2.3 to `architecture.md` in this change. |
| 5 | **Credential leakage isn't addressed.** Captured LLM-provider exchanges carry `Authorization`/`x-api-key` headers. §11.2's existing secrets bullet only covers terminal-output tool results, not captured HTTP headers — as written, a raw exchange could reach the frontend with a live API key in it. | High — security | §4 below defines redaction at the provider boundary; a security bullet was added to `architecture.md` §11.2. |
| 6 | **SSE/streaming reassembly is unaddressed.** Anthropic/OpenAI chat responses are typically `text/event-stream`; a decoder that expects one JSON body will silently fail to find usage fields. | Medium — decoder correctness | §5 below specifies SSE parsing per vendor, including the OpenAI case where usage is absent unless `stream_options.include_usage` was set — marked `unavailable`, not guessed. |
| 7 | **Where the new "active provider" setting is persisted was unspecified.** This is the app's first-ever local write path; every other adapter is read-only. Leaving this implicit risks it landing ad hoc inside one provider's code instead of as its own seam. | Medium | §6 below defines an `app-settings` adapter analogous to `platform/vscode-paths`; called out as a new module and a new security note. |
| 8 | **vision.md's data-source table said "the two in-scope sources" directly above a three-row table**, and the project's own name/README/`package.json` still say "GitHub Copilot Chat Session Analyser" while the vision now explicitly covers other coding agents' traffic via mitmproxy. The first is a plain contradiction (fixed). The second is a real scope-vs-identity tension that is **not** resolved here — renaming the repo/package is a bigger, separate decision than Phase 9's implementation. | Low (text) / flagged (naming) | Text fixed in `vision.md`/`README.md` in this change. Naming is called out below (§8) as a decision for whoever scopes the phase after this one — not blocking Phase 9. |
| 9 | **`GET /api/sessions`'s existing VS Code filter (`agent_name = 'GitHub Copilot Chat'`) has no mitmproxy analogue described** — not a defect, just worth stating explicitly so it isn't rediscovered mid-implementation: the mitmproxy provider has no such filter because everything in a user-pointed capture file is in scope by construction. | Low | Stated in §3 below; no doc change needed beyond this note. |

None of these are reasons to reject the requirements — they're the gaps
between a sound architectural sketch and something a TDD implementer can
start from without stalling on undocumented decisions. §2–§7 resolve them.

## 2. Resolved decision: mitmproxy capture format = HAR

The mitmproxy provider requires the user to produce a **HAR 1.2** file, via
either:

- `mitmdump -r <capture> --set hardump=<out.har>` (batch conversion of an
  existing `.mitm` capture), or
- mitmweb's built-in "Export flows → HAR" action.

This is a one-time export step the user performs outside the app (the app
never invokes mitmproxy or any external binary — no new process-execution
surface, no Python dependency). The provider only ever reads a HAR file the
user points it at. Document this export step in `docs/UserGuide.md` once the
provider ships.

Rationale: HAR is a plain JSON format with a stable, documented schema
(`log.entries[].request`/`.response`, headers as name/value pairs, body as
`content.text`, optionally base64). It requires zero new dependencies beyond
`JSON.parse`, matches this project's "defensive, hand-rolled parsing" pattern
already used for `main.jsonl` (§7), and every entry already carries
timing/headers/body together, which the decoder registry needs.

## 3. Resolved decision: one capture file = one session

`listSessions()` on the mitmproxy provider returns exactly one
`ProviderSessionSummary` per configured HAR file (`id` = a stable hash of the
file path + mtime, `startedAt` = the file's earliest entry timestamp,
`title` = the file's basename unless a friendlier label is added later).
Multiple HAR files (e.g. one per capture run) show as multiple sessions.

This avoids inventing a grouping heuristic with no ground truth to validate
it against — consistent with constraint 6. Idle-gap-based grouping of
entries *within* one long-running capture is recorded as an open question in
`architecture.md` §13, not implemented now.

Unlike the VS Code provider, there is no `agent_name` filter: every request/
response pair in the file that a decoder recognizes is in scope, because the
user chose what to capture by pointing mitmproxy at it.

## 4. Resolved decision: credential redaction at the provider boundary

Before an entry is handed to any `MitmExchangeDecoder`, the mitmproxy adapter
strips (does not merely mask) these header names, case-insensitively, from
both request and response: `authorization`, `x-api-key`, `api-key`,
`proxy-authorization`, `cookie`, `set-cookie`. This happens in one place —
`data-sources/log-providers/mitmproxy/redact-headers.ts` — so no decoder can
accidentally forward a credential by omission. Write the failing test for
this (a fixture entry with a live-looking `Authorization` header comes back
without that key at all) before any decoder exists, since every later test
fixture depends on this already being true.

## 5. Resolved decision: SSE reassembly per vendor

HAR's `response.content.text` already holds the full response body
mitmproxy buffered, whether or not the wire transfer was chunked/streamed —
decoders do not do any network-level stream handling, only text parsing.

- **Recognizing a streamed response**: `response.content.mimeType` is
  `text/event-stream`, or the body starts with `event:`/`data:` lines.
- **Anthropic decoder**: split on blank-line-delimited SSE events, parse each
  `data:` payload as JSON, and take usage from the `message_start` (initial
  `input_tokens`) and `message_delta`/`message_stop` events (`output_tokens`,
  and cache fields when present). A non-streamed Anthropic response (a single
  JSON body) is decoded directly from its `usage` object — same decoder,
  different entry point, same normalized output.
- **OpenAI decoder**: same SSE splitting; usage only appears on the final
  chunk, and only if the request body had
  `"stream_options": {"include_usage": true}`. When that wasn't set, mark
  every `TokenCount` field `{ known: false, reason: "OpenAI stream did not
  request usage (stream_options.include_usage was not set)" }` — this is
  Phase 9's version of constraint 8's "actionable unavailable," not a bug.
- Malformed SSE (unparseable `data:` JSON) degrades that one exchange to
  `unavailable`, per constraint 6, and does not fail the rest of the session.

## 6. Resolved decision: where the active provider is persisted

New module `platform/app-settings-dir` (sibling to `platform/vscode-paths`)
resolves an OS-conventional per-user app-config directory (Linux:
`$XDG_CONFIG_HOME` or `~/.config/gh-cp-chat-analyser`; macOS: `~/Library/
Application Support/gh-cp-chat-analyser`; Windows: `%APPDATA%\gh-cp-chat-
analyser`) containing one file, `settings.json`, currently holding only
`{ "activeProviderId": string }`. `data-sources/log-providers` reads it at
startup (default `"vscode"` if absent/first run) and writes it only in
response to `PUT /api/log-providers/active`.

This is the only file the app ever writes (see the `architecture.md` §11.2
addition in this change) — every other adapter stays strictly read-only.
Write the failing round-trip test (`write` then `read` returns the same id;
missing file defaults to `"vscode"`; corrupt file degrades to the default
rather than crashing startup) before wiring this into the registry.

## 7. Contracts

```ts
// packages/domain or a server-local module — see §10 for the exact home
interface ProviderSessionSummary {
  providerId: string;
  sessionId: string;
  title: string;
  model: string;
  startedAt: string; // ISO date
}

interface NormalizedExchange {
  requestIndex: number;
  usage: TurnUsage; // per-field known/unavailable, never fabricated
  toolCalls: ToolCallRecord[];
}

interface NormalizedSession {
  turns: NormalizedExchange[];
  usageDataAvailable: boolean;
}

interface LogProvider {
  readonly id: string;
  readonly label: string;
  checkAvailability(): Promise<{ available: boolean; unavailableReason?: string }>;
  listSessions(): Promise<ProviderSessionSummary[]>;
  readSession(sessionId: string): Promise<NormalizedSession>;
}

// mitmproxy-only, never imported outside data-sources/log-providers/mitmproxy
interface RawMitmExchange {
  requestHeaders: Record<string, string>; // already redacted (§4)
  requestBody: string;
  responseHeaders: Record<string, string>; // already redacted (§4)
  responseBody: string;
  timestamp: string;
}

interface MitmExchangeDecoder {
  readonly vendorId: "anthropic" | "openai";
  recognizes(exchange: RawMitmExchange): boolean;
  decode(exchange: RawMitmExchange): NormalizedExchange;
}
```

`LogProviderDescriptor`/`LogProviderStatus` (already defined in
`architecture.md` §5) are the only shapes that cross the API boundary; the
interfaces above are internal to `packages/server` and never reach
`packages/web` or the `domain` package's public exports, per §6.2.1's "does
not escape the provider implementation."

## 8. Module-by-module TDD sequence

Follow this order — each step's tests must fail against the previous step's
code before being made to pass, per constraint 11 and §11.4:

1. **`LogProvider` contract test harness.** One shared test suite
   (`packages/server/src/data-sources/log-providers/contract.test.ts`) that
   takes any `LogProvider` and asserts: `listSessions()` returns summaries
   with non-empty ids; `readSession()` on an unknown id rejects predictably;
   `checkAvailability()` reflects a missing/misconfigured source. Write this
   before either concrete provider exists — it has no implementation to pass
   yet, which is the point.
2. **Adapt the VS Code path.** Wrap the existing `sqlite`/`jsonl` adapters
   and `session-enricher` behind a `VscodeLogProvider` that satisfies the
   contract suite. This is a refactor of Phases 3–6's working code, not new
   ingestion logic — the existing SQLite/jsonl tests keep passing unchanged;
   only the new adapter class gets new tests.
3. **Registry + settings + API, VS Code as the only registered provider.**
   `platform/app-settings-dir` (§6) → provider registry (`register`,
   `list`, `getActive`, `setActive`) → `GET /api/log-providers` and
   `PUT /api/log-providers/active`. Write the failing API tests first
   (list returns `["vscode"]`; PUT to an unknown id 4xxs; PUT to `"vscode"`
   persists and is reflected on the next `GET`).
4. **Header redaction (§4).** Standalone, provider-agnostic-shaped module
   with its own failing test before any mitmproxy code imports it.
5. **`MitmproxyLogProvider` reading a HAR fixture**, satisfying the same
   contract suite from step 1, with zero decoders registered yet — every
   exchange comes back `unavailable`/"unrecognized vendor" (§6.2.3's
   fallback path). This proves the provider/decoder-registry seam works
   before any vendor-specific logic exists.
6. **Anthropic decoder**, then **OpenAI decoder** — each gets its own
   failing captured-exchange fixture test first (non-streamed, streamed,
   missing-usage per §5), then the implementation. Add an "unknown vendor"
   fixture that neither decoder recognizes and assert it stays
   `unavailable` without throwing.
7. **Wire `MitmproxyLogProvider` into the registry** alongside `vscode`.
   `GET /api/log-providers` now returns both descriptors.
8. **Frontend**: extend `api-client` with the two new endpoints, add the
   provider `Select` to `AppHeader`, and store `activeProviderId` in
   `session-store`. Write the interaction test first — selecting a provider
   clears the selected session and refetches `GET /api/sessions` — before
   wiring the control, per the existing Phase 9 note in
   `implementation-plan.md`.
9. **Test-only third provider** (per the exit criterion) — a minimal
   in-memory `LogProvider` implementation used only in a test that asserts
   registering it required touching zero files outside
   `data-sources/log-providers/` and the registration call site. This is the
   OCP proof, not shipped functionality.

## 9. Fixtures needed

All fixtures are synthetic/hand-authored (never a real captured API key or
real proprietary prompt content), stored under
`packages/server/fixtures/mitmproxy/`:

- `anthropic-non-streamed.har`, `anthropic-streamed.har`
- `openai-streamed-with-usage.har`, `openai-streamed-without-usage.har`
- `unknown-vendor.har` (a request/response shape neither decoder recognizes)
- `malformed-sse.har` (unparseable `data:` payload, for the graceful-
  degradation test in step 6)
- `has-credentials.har` (used only by the redaction test in step 4; asserts
  the header is gone, not merely masked)

## 10. Where the code lives

Confirms `architecture.md` §10's existing tree — no changes needed there,
this just makes the ownership explicit:

- `packages/server/src/data-sources/log-providers/` — registry,
  `LogProvider` interface, contract test harness, `platform/app-settings-dir`
  usage.
- `packages/server/src/data-sources/log-providers/vscode/` —
  `VscodeLogProvider` (wraps existing `sqlite`/`jsonl`/`session-enricher`).
- `packages/server/src/data-sources/log-providers/mitmproxy/` —
  `MitmproxyLogProvider`, `redact-headers.ts`, HAR parsing.
- `packages/server/src/data-sources/log-providers/mitmproxy/decoders/` —
  `anthropic.ts`, `openai.ts`, the `MitmExchangeDecoder` registry.
- `packages/server/src/platform/app-settings-dir/` — new, alongside the
  existing `platform/vscode-paths`.

## 11. Exit criterion (unchanged from implementation-plan.md, restated)

The user can list and select VS Code or mitmproxy in the Analyze UI. Both
providers load sessions through the unchanged `/api/sessions` contract and
shared UI. Anthropic and OpenAI HAR fixtures normalize to the same domain
schema, and the test-only third provider (§8, step 9) proves no API or
frontend component changes are required to add a provider.

## 12. Explicitly out of scope for Phase 9

- Idle-gap session grouping within one long-running mitmproxy capture
  (§3; `architecture.md` §13 open question).
- Any project/package/repo rename reflecting the broadened "any coding
  agent" scope (§1 finding 8) — a separate, larger decision.
- Live/streaming capture (the app only ever reads a HAR file the user
  already exported; it never runs or drives mitmproxy itself).
- Vendors beyond Anthropic and OpenAI (additive later, per the decoder
  registry's whole purpose).

## 13. Local mitmproxy setup on Ubuntu, for development and fixture collection

This is a one-time environment setup for whoever implements §8 steps 5–7 — it
produces the real HAR captures that the checked-in fixtures (§9) get trimmed
and redacted from. It is dev-machine setup, not something the app or its
tests do automatically (§12: the app never runs or drives mitmproxy itself).

**Important caveat before starting.** GitHub Copilot Chat's own network
traffic goes to GitHub's own backend (`api.githubcopilot.com` / `*.github
copilot.com`), not directly to `api.anthropic.com`/`api.openai.com` — so
capturing VS Code's traffic will *not* produce Anthropic/OpenAI-SDK-shaped
exchanges for the decoders to recognize. It's useful only for exercising the
mitmproxy provider's "unrecognized vendor" fallback path (§6.2.3). To get
genuine vendor-shaped fixtures for the Anthropic/OpenAI decoders, generate
traffic with the actual vendor SDKs directly (a throwaway script), per step 3
below — this is what the vision's "mitmproxy captures of LLM-provider
traffic" is actually for (other coding agents that do call these APIs
directly, e.g. Claude Code, aider).

1. **Install mitmproxy.** Prefer `pipx` over the Ubuntu repo's package (per
   `architecture.md` §11.6, always the latest stable release):
   ```sh
   sudo apt install -y pipx
   pipx install mitmproxy
   pipx ensurepath   # then open a new shell
   mitmdump --version
   ```
2. **Trust mitmproxy's CA cert — scoped to the test client only, not
   system-wide.** Run `mitmdump` once (Ctrl-C after a few seconds) to
   generate `~/.mitmproxy/mitmproxy-ca-cert.pem`. For a Node.js test script
   (step 3), point it at that cert via an env var instead of touching the
   system trust store:
   ```sh
   export NODE_EXTRA_CA_CERTS="$HOME/.mitmproxy/mitmproxy-ca-cert.pem"
   ```
   (Only install it into `/usr/local/share/ca-certificates/` and run
   `update-ca-certificates` if you actually need a non-Node client, e.g. VS
   Code itself, to trust it for the fallback-path capture in the caveat
   above — and remove it again afterward, since it weakens TLS validation
   machine-wide for as long as it's installed.)
3. **Generate genuine vendor traffic through the proxy.** A minimal
   throwaway script per vendor, run with `HTTPS_PROXY` pointed at mitmproxy
   and the cert from step 2 trusted:
   ```sh
   mitmdump --set hardump=/tmp/anthropic-capture.har &
   HTTPS_PROXY=http://127.0.0.1:8080 NODE_EXTRA_CA_CERTS="$HOME/.mitmproxy/mitmproxy-ca-cert.pem" \
     node -e '
       const Anthropic = require("@anthropic-ai/sdk");
       const client = new Anthropic();
       client.messages.create({
         model: "claude-3-5-haiku-latest",
         max_tokens: 64,
         messages: [{ role: "user", content: "say hi" }],
         stream: true,
       }).then(async (s) => { for await (const _ of s) {} });
     '
   kill %1
   ```
   Repeat against the OpenAI SDK, once **with** `stream_options:
   { include_usage: true }` and once **without**, to produce the two OpenAI
   fixtures §9 needs (`openai-streamed-with-usage.har` /
   `openai-streamed-without-usage.har`). Run each vendor capture separately
   (`hardump` per run) so entries don't get mixed across vendors in one file.
4. **Optional: capture VS Code Copilot Chat's own traffic**, to exercise the
   "unrecognized vendor" fallback path (§6.2.3) with a real shape rather than
   a synthetic one, and to empirically check the §13 caveat above (Copilot
   Chat's requests go to GitHub's own backend, not directly to
   `api.anthropic.com`/`api.openai.com` — this capture is how you'd confirm
   that rather than assume it). This is scoped to a throwaway VS Code launch,
   not a persistent machine-wide proxy.

   **Setting `http.proxy` alone is not sufficient scoping** — it routes
   *every* HTTP(S) call VS Code makes (telemetry, marketplace, unrelated
   extensions' network calls, general `github.com` API traffic) through
   mitmproxy, and without a host filter, `mitmdump` intercepts and records
   all of it. The thing that actually assures only Copilot service traffic
   is captured is mitmproxy's `--allow-hosts` flag: hosts that don't match
   are passed through the proxy without being intercepted/decrypted, so they
   never appear in the flow list or the HAR dump at all. Per GitHub's own
   [Copilot allowlist reference](https://docs.github.com/en/copilot/reference/copilot-allowlist-reference)
   (check it at capture time — these hosts do change), the ones relevant to
   VS Code Copilot Chat are:
   - `api.githubcopilot.com` (and its `*.individual/business/enterprise.
     githubcopilot.com` variants) — the actual chat/completion API calls,
     including the `usage` fields the decoders need.
   - `api.github.com` (specifically `/copilot_internal/*`) — Copilot token
     exchange; no message content, but part of a working session.

   Deliberately excluded from the filter: `copilot-proxy.githubusercontent.
   com`/`origin-tracker.githubusercontent.com` (inline-completion suggestions,
   not Chat), and the telemetry hosts (`collector.github.com`,
   `copilot-telemetry.githubusercontent.com`, `default.exp-tas.com`) — none
   of these carry the request/response usage data this fixture needs, and
   excluding them keeps the capture free of unrelated analytics payloads.
   ```sh
   # 1. Fully quit VS Code first (all windows).
   # 2. Start mitmproxy bound to a known port, dumping straight to HAR,
   #    intercepting ONLY the Copilot Chat hosts above:
   mitmdump --set hardump="$HOME/copilot-capture.har" \
     --allow-hosts '^(api\.githubcopilot\.com|.*\.githubcopilot\.com|api\.github\.com)$' &
   ```
   Then add these two lines to the VS Code `settings.json` this project
   already reads (per the Phase 3 note in §6.2.2:
   `~/.config/Code - Insiders/User/settings.json` on this machine) — remove
   them again once the capture is done, don't leave a proxy configured:
   ```jsonc
   "http.proxy": "http://127.0.0.1:8080",
   "http.proxyStrictSSL": true // keep true — NODE_EXTRA_CA_CERTS (below) is
                                // what makes the mitmproxy CA trusted; don't
                                // disable cert validation instead
   ```
   Relaunch VS Code with the mitmproxy CA trusted for its (Node-based)
   extension host:
   ```sh
   NODE_EXTRA_CA_CERTS="$HOME/.mitmproxy/mitmproxy-ca-cert.pem" code
   ```
   Then send one Copilot Chat message, wait for the reply, stop `mitmdump`
   (`kill %1`), and quit VS Code. Inspect `~/copilot-capture.har` (e.g.
   `jq '.log.entries[].request.url' copilot-capture.har`) — every entry
   should now be under one of the two allow-listed hosts; if `api.github.com`
   entries unrelated to `/copilot_internal/*` show up (the allow-hosts filter
   matches on host, not path), drop them when trimming the fixture in step 6.
   If it turns out GitHub's backend does forward a recognizable Anthropic/
   OpenAI-shaped payload for some models, that's new information worth
   folding back into `architecture.md` §13 (a Copilot-passthrough case may be
   worth its own decoder, or an extension to an existing one) rather than
   something this document should guess at now.
5. **`mitmdump --set hardump=<path>`** (used in steps 3–4 above) writes HAR
   directly while capturing — there's no need for a separate `.mitm` → HAR
   conversion step unless working from a capture someone already took with
   `-w`, in which case:
   ```sh
   mitmdump -r existing-capture.mitm --set hardump=converted.har
   ```
6. **Never commit a raw capture.** Every HAR produced above contains a real,
   live credential in its request headers (a vendor API key in steps 1–3, or
   your GitHub-issued Copilot token in step 4) and the real prompt content
   sent. Before a capture becomes a checked-in fixture under
   `packages/server/fixtures/mitmproxy/`:
   - Strip the same headers `redact-headers.ts` (§4) strips — by hand if
     that module doesn't exist yet at the point you're capturing, since
     fixture collection for steps 6 in §8 has to happen before step 4 is
     necessarily done; otherwise pipe the capture through it once it does.
   - Trim `log.entries` down to just the one or two exchanges the fixture
     needs — a fixture is a minimal reproduction, not a full session replay.
   - Rewrite the prompt/response text to short placeholder content; only the
     `usage`-bearing structure needs to be real, not the conversation content.
   - Rename to match §9's fixture list and re-run the decoder test against it
     before committing, so the fixture is proven to exercise the code path it
     claims to.
