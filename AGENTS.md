# Repository Guidelines

## Project Structure & Module Organization
- Entry point: `index.tsx` mounts `<App />`; global styles live in `src/index.css` and `src/mystyle.css`.
- UI & controls: interactive panels and visuals in `components/Controls.tsx` and `components/Visuals.tsx`.
- Simulation core: N-body logic in `services/physicsEngine.ts`; scenario-specific logic in `services/controllers/rosetteController.ts`.
- Presets & data: preset definitions and random generation in `constants.ts`; preset registry in `modes/registry.ts`; shared types in `types.ts`.
- Assets & output: static images in `images/`; build artifacts in `dist/` (do not edit by hand); experiments/tests in `tests/`.

## Build, Test, and Development Commands
- Install dependencies: `npm install`
- Start dev server with HMR: `npm run dev` (Vite, defaults to port 3000; will choose another if busy).
- Production build: `npm run build` (emits static assets to `dist/`).
- Preview built bundle locally: `npm run preview` (serves `dist/` for smoke checks).
- Tests: no runner is wired in `package.json`; add Vitest/Jest before using `npx vitest`/`npm test`.

## Coding Style & Naming Conventions
- Language: TypeScript + React; prefer functional components and hooks.
- Indentation: 2 spaces; keep semicolons; favor single quotes in TSX/TS.
- Naming: `PascalCase` for components/types (`Controls`, `BodyState`), `camelCase` for functions/variables, `SCREAMING_SNAKE_CASE` for constants (`G_CONST`).
- State refs: keep simulation state in refs to avoid rerenders; preserve existing ref patterns when extending the loop.
- Avoid editing generated artifacts (`dist/`); place reusable utilities in `services/` or `utils/` instead of `components/`.

## Testing Guidelines
- Tests live in `tests/` (example: `tests/ColorPool.test.ts` uses `describe/test/expect` with Three.js).
- Prefer deterministic inputs for physics to keep snapshots stable; seed random scenarios or inject deterministic vectors.
- When adding a runner, gate expensive physics loops and favor unit-level assertions over frame-by-frame renders.
- Record expected energy/velocity invariants when possible to catch regressions in integrator changes.

## Commit & Pull Request Guidelines
- Commits follow Conventional Commit style seen in history (`feat:`, `fix:`). Use present tense and keep subject ≤72 chars.
- One logical change per commit; include context on presets/physics knobs touched.
- PRs: state the scenario impacted, reproduction steps, and risks; link issues; attach before/after screenshots or short clips for visual changes; note any perf impact (FPS, allocations) if touched.

## Security & Configuration Tips
- No secrets are required; do not commit API keys or personal data. Keep `.env` out of version control if introduced.
- Browser/WebGL performance varies; keep shader/particle changes behind small, configurable defaults to avoid regressions.
