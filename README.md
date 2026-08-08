# GitHub Copilot Chat Session Analyser

A local app that visualizes coding-agent sessions — turns, tool calls, cache
behavior, and token/cost accounting — to help you learn how agentic coding
tools spend tokens and money, and to analyze your own real Copilot Chat
sessions.

![App landing page, showing the Learn mode scenario list](docs/images/landing-page.png)

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

## Setup

**Prerequisites**

- Node.js 22+ (the server uses the built-in, still-experimental
  `node:sqlite` module).
- Linux, with VS Code (Stable or Insiders) and the GitHub Copilot Chat
  extension installed. The app only reads local files VS Code already
  writes — the local session-store SQLite database and per-session debug
  logs — so it works fully offline. (Other platforms aren't wired up yet;
  see [architecture.md](docs/architecture.md).)

**Install and run**

```sh
npm install
npm run dev        # starts the API server (127.0.0.1:3000) and the web app (127.0.0.1:5173)
```

Open http://127.0.0.1:5173 in a browser. Learn mode works immediately —
its scenarios are bundled fixtures. Analyze mode lists any real Copilot
Chat sessions it finds in your local VS Code session store.

Other commands (from the repo root):

```sh
npm test           # runs vitest for every workspace
npm run lint        # eslint across the repo
npm run build        # type-checks/builds every workspace
```

## Enabling GitHub Copilot Chat debug logging

Analyze mode's real per-turn token/cache numbers (cache write/read,
uncached input, tool, vision, reasoning, output, and cost) come from
Copilot Chat's own debug log (`main.jsonl`). By default VS Code only
writes a minimal log with no usage data, so this setting has to be turned
on explicitly:

1. Open your VS Code user `settings.json` (Command Palette → **Preferences:
   Open User Settings (JSON)**), normally at
   `~/.config/Code/User/settings.json` (Stable) or
   `~/.config/Code - Insiders/User/settings.json` (Insiders) on Linux.
2. Add:
   ```json
   "github.copilot.chat.agentDebugLog.fileLogging.enabled": true,
   "github.copilot.chat.agentDebugLog.fileLogging.maxRetainedSessionLogs": 200
   ```
   The retention setting is optional but recommended — VS Code's own
   default (50) can prune logs for sessions you'd still want to analyze
   later.
3. Reload the VS Code window (Command Palette → **Developer: Reload
   Window**) for the setting to take effect.

Only *future* sessions started after this reload will have full token/cache
detail — logging is not retroactive. The app checks this automatically on
startup: if the setting is missing, off, or the retention is too low, a
warning banner explains exactly what to fix and where (see
`GET /api/config/status`). Sessions recorded before enabling it still show
up in Analyze mode, just without per-token figures.

## Using the app

The app has two modes that share the same layout — a turns table, an
explanation/detail panel, and a timeline scrubber to step through a
session turn by turn:

- **Learn mode** — pick one of the bundled scenarios (cache basics, context
  compaction, an MCP tool change mid-session, a model switch mid-session,
  …) to see a guided, turn-by-turn walkthrough of how caching and token
  accounting work, with a plain-language explanation for each turn.
- **Analyze mode** — pick one of your own real Copilot Chat sessions to see
  the same breakdown for what actually happened, plus (once debug logging
  is enabled, above) a system-prompt breakdown, the full tool inventory
  cross-referenced against which tools were actually invoked, and per-turn
  tool-call/file detail.

## License

[MIT](LICENSE)
