# CLAUDE.md

Project-specific guidance for working in this repo. Full context lives in
the docs below — read them before making changes; don't duplicate their
content here.

- [README.md](README.md) — doc index
- [docs/vision.md](docs/vision.md) — product scope, non-goals
- [docs/architecture.md](docs/architecture.md) — system design, guiding
  constraints, engineering practices (TDD + SOLID)
- [docs/implementation-plan.md](docs/implementation-plan.md) — phase order,
  exit criteria, current default tech choices
- [docs/agentic-coding-explained.md](docs/agentic-coding-explained.md) —
  domain reference Learn mode is seeded from

## Rules for this repo

- Treat the docs above as the source of truth. If an implementation
  decision conflicts with them, update the relevant doc in the same change
  rather than letting it drift.
- Follow `architecture.md`'s numbered constraints and §11.4/§11.5 (TDD,
  SOLID) for any code change — write the failing test first.
- Follow `implementation-plan.md`'s phase order and each phase's exit
  criterion; don't start a later phase's work before its dependencies are
  met.
- Commit all changes to git as soon as a phase's exit criterion is met,
  before starting the next phase.
- Repo status: Phases 0-8 complete — npm workspaces with `packages/domain`
  (zod schemas + types for every architecture.md §5 shape, including
  `Session.category`/`startedAt`), `packages/server` (Express API:
  Learn-mode fixtures plus real Analyze-mode sessions read read-only from
  the local VS Code SQLite store via `node:sqlite`, enriched with real
  per-turn token/cache numbers extracted from `main.jsonl`, plus
  Analyze-mode-only system-prompt breakdown and tool-inventory/tool-call
  detail extracted from `main.jsonl`'s sibling artifacts; a startup config
  check reads `settings.json` and exposes `GET /api/config/status`),
  `packages/web` (Vite + React, styled with the "Industry" design system
  ported from `Design/` into `theme.css` — header with mode switch, a
  searchable session list, an 11-column turns table, a tabbed
  Explanation/System-prompt/Tools right column, a dismissible structured
  config-warning banner, zero-data empty states — built on shared
  `components/ui/*` primitives; `charts/AiCreditsSparkline` is the sole
  remaining D3 chart, in the center column's header row), Vitest wired
  with TDD-first tests. Phase 9 (VS Code extension packaging) is
  future/out of MVP scope — see implementation-plan.md.
