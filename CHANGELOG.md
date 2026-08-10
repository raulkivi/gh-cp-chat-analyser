# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
