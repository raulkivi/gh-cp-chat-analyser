# GitHub Copilot Chat Session Analyser

A local app that visualizes coding-agent sessions — turns, tool calls, cache
behavior, and token/cost accounting — to help you learn how agentic coding
tools spend tokens and money, and to analyze your own real Copilot Chat
sessions.

## Documentation

- [Vision](docs/vision.md) — the problem, goals, product concept (Learn vs.
  Analyze mode), data sources, and non-goals.
- [Architecture](docs/architecture.md) — system design: components, domain
  model, data flow, API design, tech stack, and project structure.
- [Implementation plan](docs/implementation-plan.md) — phase-by-phase build
  plan with exit criteria and dependencies.
- [Agentic coding explained](docs/agentic-coding-explained.md) — reference
  document on sessions, turns, tool calls, prompt caching, and token
  accounting; the source material Learn mode's scenarios are seeded from.

## Current implementation state (handover notes)

**Phase 0 — repo scaffolding: done. Phase 1 — domain model & schema
package: done.** Phase 2 (Learn mode, per
[implementation-plan.md](docs/implementation-plan.md)) is next.

- npm workspaces root with `packages/domain`, `packages/server`,
  `packages/web`; shared `tsconfig.base.json`; flat-config ESLint +
  Prettier.
- `packages/domain`: `zod` schemas + inferred TypeScript types for every
  shape in architecture.md §5 (`TokenCount`, `TurnUsage`, `ToolCallRecord`,
  `Turn`, `SystemPromptComponent`, `ToolInventoryEntry`, `Session`,
  `ConfigWarning`, `ConfigStatus`), each with a schema-validation test
  written before its schema. No dependency on `server`/`web`.
- `packages/server`: Express app (`src/app.ts`) with `GET /api/health`,
  bound to `127.0.0.1` only (architecture.md §11.2); entry point
  `src/server.ts` (`npm run dev` uses `tsx watch`).
- `packages/web`: Vite + React app (`src/App.tsx`) that fetches
  `/api/health` and renders the result.
- Vitest wired per package, TDD-first: each package's smoke test was
  written and confirmed failing before its implementation.

Commands (from repo root):

```sh
npm install
npm test          # runs vitest for every workspace
npm run lint       # eslint across the repo
npm run dev        # starts server + web dev servers
```

No SQLite/`main.jsonl` adapters or Learn/Analyze mode UI exist yet. Start
Phase 2 by following [implementation-plan.md](docs/implementation-plan.md)'s
TDD order for the Learn-mode scenario fixtures, API routes, and shared UI
components — validating fixtures against the `domain` package's
`sessionSchema`.

