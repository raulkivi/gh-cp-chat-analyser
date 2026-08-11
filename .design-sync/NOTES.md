# design-sync notes — gh-cp-chat-analyser

## Repo shape

`packages/web` is a **private application** (`"private": true`, builds via `vite build` to `dist/index.html`), not a component library — it has no `main`/`module`/`exports` entry and no barrel `index.ts`. Only 3 small UI primitives live under `src/components/ui/`: `Blueprint`, `SegmentedControl`, `Tag`. Everything else in the app (session list, turns table, panels, charts) is app-specific composition, not meant to be synced as reusable DS components. The user explicitly scoped this sync to just those 3 (2026-08-11).

There is also an `Industry`-type design-system project already in this claude.ai account (`167fde98-25e2-4c8f-b52b-845e821de90a`) that is **not** related to this repo — it's the generic Claude Design built-in starter kit this app's `theme.css` was originally ported *from* (see `Design/` dir and its `README.md`). Do not sync into it; this repo's target project is `cada26a4-e1c4-4b9f-a3dd-4a7fa5e325ea` ("GitHub Chat Analyser DS"), pinned in `config.json`.

## Build

No library build exists for these components, so `cfg.srcDir` is pinned to `src/components/ui` (relative to the workspace package dir) and the converter runs in **synth-entry mode** (no `dist/`, scans `src/` directly) — this is the intentional last resort, not a misconfiguration. `.d.ts` extraction from synth mode couldn't resolve the components' real (unexported) prop-type aliases, so all 3 props contracts are hand-written via `cfg.dtsPropsFor`. `SegmentedControl`'s real source is generic (`<T extends string>`); the synced contract simplifies `value`/`onChange` to plain `string` since dtsPropsFor bodies can't carry generics — still correct for any string-valued option set.

npm/node in this shell are broken (see `project_npm_shell_function_broken` — bare `npm`/`node` recurse infinitely due to a broken nvm wrapper); use `command npm`/`command node` to bypass the shell function.

## Styling

`cfg.cssEntry` points at `packages/web/src/theme.css` — a global-class stylesheet (not CSS Modules/CSS-in-JS) with a `:root` token layer, ported from a design handoff. Fonts ("Barlow", "Barlow Condensed") load via a Google Fonts `@import` in the stylesheet itself — `[FONT_REMOTE]`, no action needed.

## Re-sync risks

- If `packages/web/src/components/ui/` gains new components, they'll be picked up automatically on re-sync (synth-entry scans the whole dir) — review the new component's group/props before uploading, since `dtsPropsFor` and preview authoring are manual per-component.
- If the user ever adds a real library build (a `main`/`module` entry that exports these components) to `packages/web`, drop `cfg.srcDir` and re-run — the converter will prefer the real `dist/` + shipped `.d.ts` over synth mode, giving stronger prop contracts than the hand-written `dtsPropsFor` overrides here.
- `theme.css`'s tokens/classes are hand-maintained (not generated) — a rename of e.g. `--color-accent` or `.tag-*` would silently desync `conventions.md`'s vocabulary until the next re-sync's validation pass catches it.
- The two Google-Fonts families are assumed served at runtime by the `@import` — if that ever changes to a self-hosted `@font-face`, `[FONT_MISSING]` will fire on the next validate and `cfg.extraFonts` should be set.
