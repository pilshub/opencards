# ADR-0001: Frontend Stack

## Status

Accepted — 2026-05-17.

## Context

OpenCards needs a browser surface for Ember Duel (Phase 5 of the roadmap) and a basic card/deck editor (Phase 6). Without a locked stack, each later phase will accumulate ad-hoc decisions and drift toward inconsistency. The MVP also requires deterministic-replay-aware UI behavior, hidden-information safety, and visual smoke tests, all of which constrain the choice.

The browser layer in OpenCards has unusual requirements:

- It must read only `engine.getView(playerId)` and `engine.getLegalCommands(playerId)`. It cannot invent legality or animate from state diffs.
- Animations must fire from engine events so that replays reproduce them.
- A hash-match indicator is a first-class UI element, not a debug overlay.
- Hidden information leakage through the DOM is a correctness bug, not a polish item.
- Visual smoke tests with pixel checks ship in Phase 5.

## Decision

Lock the following stack for `packages/app`:

| Concern           | Choice                                                               |
| ----------------- | -------------------------------------------------------------------- |
| Build tool        | **Vite**                                                             |
| Framework         | **React 18**                                                         |
| Language          | **TypeScript** with `strict: true`                                   |
| Styling           | **Tailwind CSS** with CSS variables for theme tokens                 |
| UI state          | **Zustand**                                                          |
| Engine binding    | `useSyncExternalStore` over `engine.subscribe()`                     |
| Animation         | **Framer Motion**, triggered from engine events                      |
| Testing           | **Vitest** for units, **Playwright** for end-to-end and pixel checks |
| Component library | **None.** No MUI, Chakra, Radix-default themes, etc.                 |
| Drag-and-drop     | **None** in v1. Click-to-target only.                                |

### Boundaries

- **Game state lives in the core engine.** The UI does not own a parallel state tree of the match. Zustand holds UI-only state: which panel is open, current target-selection draft, scrubber position, modal flags.
- **The engine is subscribed via `useSyncExternalStore`.** `engine.getView(currentPlayerId)` is the projected state the UI renders.
- **Hidden info enforcement is the engine's job.** The UI cannot leak what the engine never gave it. A Playwright test inspects the DOM after each command and asserts no opponent card identity is present.

### Theming

One dark theme tuned to Ember Duel's tone. CSS variables expose tokens (`--card-bg`, `--energy-fg`, `--damage`, etc.) so a future second theme is a swap, not a rewrite. No theme switcher in v1.

## Alternatives Considered

- **Svelte / SolidJS.** Smaller bundles, fine-grained reactivity. Rejected because Playwright + React component-testing maturity is higher and the rest of the Open\* family already converges on React.
- **Redux Toolkit.** Overkill for UI-only state once game state is owned by the engine. The boundary "engine owns match, Zustand owns UI" is clearer without Redux's ceremony.
- **MUI / Chakra / Mantine.** Card-game UI is a visual canvas, not a forms-and-tables app. Component libraries fight the design instead of helping it.
- **CSS-in-JS (Emotion, styled-components).** Tailwind + CSS variables covers the need without runtime cost or shipping a styling engine.
- **Drag-and-drop for playing cards.** Click-to-target is more accessible, more testable in Playwright, and removes touch-vs-mouse edge cases. Revisit only if user feedback demands it.

## Consequences

- Every phase that touches the UI references this ADR. No "let's try X instead" in a feature PR.
- Bundle stays lean: framework + Zustand + Framer Motion + Tailwind output, no component library payload.
- Pixel-snapshot tests are viable from day one in Phase 5.
- A switch to a different stack later means rewriting `packages/app`. That is the trade for stability across phases.
