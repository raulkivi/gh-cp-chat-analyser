# Code and Security Review Findings (2026-08-08)

## Scope
- Repository: `raulkivi/gh-cp-chat-analyser`
- Focus: server-side session/log processing path and related JSONL ingestion logic

## Security review summary
- No high-confidence exploitable security vulnerabilities were identified in the reviewed areas.

## Code review findings

### 1) High — `main.jsonl` data is fully accumulated in memory per request
- **File:** `packages/server/src/data-sources/jsonl/main-jsonl-reader.ts`
- **Evidence:** `readMainJsonlEnvelopes()` parses line-by-line but appends all parsed envelopes into an in-memory array and returns the full set.
- **Impact:** Requests that process large `main.jsonl` files can cause high memory pressure and reduced server stability/throughput.
- **Recommendation:** Refactor extraction/classification to process envelopes incrementally (streaming aggregation) instead of materializing the full file in memory.

### 2) Medium — Availability classification can hide parse/format failures
- **File:** `packages/server/src/data-sources/jsonl/main-jsonl-reader.ts`
- **Evidence:** `classifyEnvelopesAvailability()` returns `"logging-never-enabled"` when parsed envelope count is `<= 1`, while malformed/unparseable lines are silently dropped.
- **Impact:** Logs that exist but fail parsing can be misreported as “logging never enabled,” masking parser regressions and reducing diagnosability.
- **Recommendation:** Track additional signal (for example, raw line count and/or parse-failure count) and classify unreadable-but-present logs separately from true `session_start`-only cases.

## Notes
- These findings are based on direct source inspection and focused review of the current repository state.
