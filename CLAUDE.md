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
- Repo status: docs-only, pre-implementation (Phase 0 of the implementation
  plan hasn't started yet).
