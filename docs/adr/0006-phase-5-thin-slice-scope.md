# ADR-0006: Phase 5 Thin Slice Scope

## Status

Accepted - 2026-06-22.

## Context

ADR-0001 locks the frontend stack as Vite, React 18, TypeScript strict, Tailwind CSS, Zustand, Playwright and Framer Motion. The Phase 5 deployable slice only needs to demonstrate the public `@opencards/core` facade in a single hot-seat Ember Duel screen. `docs/dev-system.md` frames the practical no-over-engineering principle by requiring every test to have a reason, keeping the gate under five minutes and deferring later-phase checks until their phase exists.

## Decision

1. Ship Vite, React 18, TypeScript strict and Tailwind CSS now because they are required to build and deploy the browser surface.
2. Keep match UI state in React `useState` because the slice has one screen, two fixed viewer handles and no cross-route UI state.
3. Defer Zustand until UI-only state grows beyond the seed, current handles, player projections, command errors and replay textarea.
4. Defer Framer Motion until facade events or another deterministic animation trigger are exposed.
5. Defer Playwright to Phase 7 and cover this slice with Vitest plus Testing Library, including a DOM hidden-information assertion.

## Alternatives

1. Add Zustand immediately to match ADR-0001 literally. Rejected because it would add an unused abstraction around one local screen state.
2. Add Framer Motion immediately with visual-only transitions. Rejected because ADR-0001 requires animations to be driven by deterministic engine events.
3. Add Playwright now for the DOM hidden-information smoke. Rejected because the current gate and roadmap defer end-to-end browser smoke to Phase 7.
4. Keep the app as a stub until all ADR-0001 tools are present. Rejected because Phase 5 needs a deployable Vercel demo of the existing facade.

## Consequences

1. The deployable app demonstrates the engine facade without importing `@opencards/core/internal`.
2. ADR-0001 remains the target stack, but this ADR records the temporary Phase 5 scope boundary.
3. The app stays easy to replace or extend when Zustand, deterministic animation events and Playwright arrive.
4. Hidden-information behavior is still tested in the app package before browser e2e exists.
