# @opencards/app

Browser play and editor surface for OpenCards.

**Status:** Phase 0 stub. Real implementation begins in Phase 5 once the deterministic core (Phases 1–3) and effect engine (Phase 4) are in place.

**Locked stack:** Vite + React 18 + TypeScript strict + Tailwind + Zustand + Framer Motion + Playwright. See [docs/adr/0001-frontend-stack.md](../../docs/adr/0001-frontend-stack.md).

**Architectural rules** (applied as soon as code lands here):

- UI reads only `engine.getView(playerId)` and `engine.getLegalCommands(playerId)`.
- Action affordances render from the legal commands list. No invented legality.
- Target selection is an explicit state machine.
- Animations trigger from engine events, not from state diffs.
- Hash-match verification is a visible UI element.

Update [packages/app/README.md](README.md) when the Phase 5 scaffold lands.
