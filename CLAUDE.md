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
- Repo status: Phases 0-3 complete — npm workspaces with `packages/domain`
  (zod schemas + types for every architecture.md §5 shape), `packages/server`
  (Express API: Learn-mode fixtures plus real Analyze-mode sessions read
  read-only from the local VS Code SQLite store via `node:sqlite`),
  `packages/web` (Vite + React, shared Learn/Analyze layout), Vitest wired
  with TDD-first tests. Phase 4 (`main.jsonl` parsing & enrichment) is
  **partially done**: the streaming reader/envelope parser, §7 gating check,
  and session-enricher's two-reason split are built; the extractor registry
  (real per-turn numbers) is blocked on real usage-span fixture data — see
  implementation-plan.md's Phase 4 status note.
