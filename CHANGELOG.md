# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- New Analyze-mode log provider, `pi-agent`, reading the
  [pi coding agent](https://pi.dev)'s native JSONL session format directly
  (`~/.pi/agent/sessions/`) — selectable alongside `vscode`/`mitmproxy` via
  the existing provider select, with no API or frontend changes required.
  Since a pi session is a branchable tree (fork/rewind), a session file with
  unmerged branches now lists one session per branch tip, titled
  `<name> (branch i of N)`, the same "one file, many sessions" pattern
  already used for mitmproxy's idle-gap splitting. `tool`/`vision`/`reasoning`
  token breakdowns and `costAiCredits` are marked unavailable for pi sessions
  pending confirmation against a real captured session (no fabricated
  numbers, per the app's usual policy).
- mitmproxy provider: a single `.har` capture is now split into multiple
  Analyze-mode sessions when a gap of more than 30 minutes separates two
  captured exchanges, so one long-running capture spanning several
  coding-agent runs no longer shows up as one mixed-together session.
  Split sessions are titled `<filename> (session i of N)`.
- Zoomable icicle diagram for the system-prompt inspector: flexbox bars
  (one row per visible depth level, each bar sized proportionally to its
  section's character count) with click-to-zoom into subparts and a
  breadcrumb trail back out, available alongside the existing Pretty/Raw
  toggle. Each bar shows a bold section name and, in smaller text below,
  its character count and share of the current zoomed-in view as a
  percentage; a name too long for its bar is clipped with an ellipsis.
  Built with plain CSS so it fills all available width and its text
  always renders at true size, with no JavaScript-driven layout
  measurement.

### Fixed
- Switched to American English spelling ("Analyzer", "canceled", "unlabeled")
  throughout app UI text and documentation.
- Corrected several Learn-mode arithmetic errors found in a fact-check of the
  scenario docs: wrong per-turn token totals in Scenarios 10-13, 15-17
  (`docs/scenarios/`), a wrong AI Credits figure in Scenario 13, and a
  missing-diagram mislabel for Scenarios 8, 12, 15, 17 in the scenario index.
  Two of the AI Credits errors were baked into the served fixtures
  (`image-attachment-invalidation.json` turn 2, `cache-ttl-1-hour-breakpoint.json`
  turn 3), so Learn mode now shows the corrected values for those turns.

## [0.4.0] - 2026-08-10
### Added
- Phase 9: extensible `LogProvider` registry with `MitmproxyLogProvider`
  (redacted HAR captures, Anthropic/OpenAI vendor-decoder registry) alongside
  `VscodeLogProvider`; `GET /api/log-providers` and
  `PUT /api/log-providers/active` to select the active source.
- Phase 9.5: per-turn `TurnInspector` request/response drill-down.
- System prompt inspector and AI-advice export panel.
- Rounds-count column in the turns table.
- GitHub Actions CI and package metadata.

### Changed
- Turn Inspector layout redesigned per `Design/README.md`.

## [0.3.0] - 2026-08-09
### Added
- Illustrated `UserGuide.md` covering Learn and Analyze modes.
- AI Credits cost reporting: session-list totals and cumulative per-row
  totals in the turns table.

### Fixed
- Path-traversal and unhandled-crash security gaps (Analyze mode).
- Four user-visible Analyze-mode correctness bugs.
- Four lower-severity correctness bugs.

### Changed
- Renamed "cost" to "AI Credits" across docs, fixtures, and UI.
- Duplication/simplification cleanup pass.

## [0.2.0] - 2026-08-08
### Added
- Phase 8: "Industry" design system applied to `packages/web`.
- MIT license.

## [0.1.0] - 2026-08-08
### Added
- Phases 0-7: npm workspace scaffolding, domain schema package, Learn mode
  (bundled scenarios), Analyze mode reading real VS Code sessions from
  SQLite, `main.jsonl` extractor registry with real usage data, startup
  configuration check, system-prompt breakdown / tool inventory / turn
  detail, shared D3 charts.
