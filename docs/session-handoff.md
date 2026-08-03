# OpenCards Session Handoff

Last updated: 2026-08-03, after a long Horizon 2 session that shipped real-time
multiplayer. This file is the single "what's actually true right now" doc —
read this first when picking the project back up on any machine.

## What this project is

A deterministic card-game engine (TypeScript monorepo) plus one full reference
game (Ember Duel: Foundry Set) built on top of it, plus a browser app to play
it. The core invariant, unchanged since Phase 1 and still enforced by tests:

```
card db hash + decklist hash + setup + seed + ordered commands = final state hash
```

## Live right now

- **Production app:** https://opencards-teal.vercel.app — public, no login,
  playable today (hot-seat local, deck editor, card creator, draft mode).
- **GitHub:** https://github.com/pilshub/opencards, branch `main`, always the
  source of truth (this doc lags behind the code by design — check `git log`
  and `docs/roadmap-horizon-2.md`'s progress log for anything newer than this
  date).
- **CI:** GitHub Actions runs `npm run verify:mvp` on every push/PR, Ubuntu +
  Windows matrix.

## How functional is it, honestly

Verified by hand this session, not assumed:

| Capability                                               | Status                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic engine, replay, hidden info                | Solid — 193+ tests, 200/200 seed replay, hidden-info verified both directions                                                                                                                                                                                                                                                                                       |
| Hot-seat local play (one browser tab, two seats)         | Works in production today                                                                                                                                                                                                                                                                                                                                           |
| Card creator / deck editor / draft                       | Works in production today, decks are valid by construction                                                                                                                                                                                                                                                                                                          |
| Real-time multiplayer (`packages/server`, WebSocket)     | **Works, verified live with real browser tabs — but not deployed anywhere.** Only usable if someone runs `packages/server` themselves (see below). The app's Online/Watch tabs default to `ws://localhost:8787`.                                                                                                                                                    |
| Spectator mode                                           | Works, both hands correctly masked to a watcher — verified live                                                                                                                                                                                                                                                                                                     |
| A second game built on the engine (`games/quick-sparks`) | **Engine-level only.** Proves the engine isn't single-game (105 lines, zero engine changes, its own ruleset/cards/tests), but it is NOT reachable from the app UI at all — no game selector exists, the app is hardcoded to Ember Foundry (`createFoundrySetup`, `BUILTIN_DEFINITIONS`). `FormatEditor` carries a `ruleset` field through but has no UI to edit it. |
| Real users                                               | **Zero.** Everything above is verified by the orchestrator, not by anyone actually playing it.                                                                                                                                                                                                                                                                      |
| Accounts, persistence beyond `localStorage`, matchmaking | Not built — deliberately paused, see below                                                                                                                                                                                                                                                                                                                          |

**One-line summary:** excellent, well-tested engineering prototype; a real
product for zero users so far. The gap between "works" and "is a product" is
mainly A3 below.

## Explicit open decisions (need the user, not the orchestrator)

- **A3 — accounts + persistent collection + hosting the server publicly.**
  Requires picking real infrastructure (a host for `packages/server`, a
  database, an auth strategy, ongoing cost). The orchestrator has deliberately
  NOT picked a stack unilaterally — this needs the user's call. Once decided,
  `packages/server`'s `MatchRoom` architecture (already holds canonical
  `State` server-side, already broadcasts hidden-info-safe projections) is
  ready to be exposed publicly with minimal rework.
- **D2 — visual regression (Playwright screenshot diffing).** Paused because
  this dev environment's Docker daemon isn't running, and CI runs both
  `ubuntu-latest` and `windows-latest` — baselines generated on the wrong
  platform would cause spurious failures. Revisit once Docker Desktop is
  actually running, or generate baselines from a real CI run instead of
  locally.
- **A game selector in the app UI.** The engine supports multiple games
  (`games/quick-sparks` proves it); the app does not expose that. Closing this
  is a scoped, well-understood slice (reuse the `createFoundrySetup` /
  `createQuickSparksSetup` pattern for a picker that swaps `pool`, `ruleset`,
  and setup together) — not started because it wasn't asked for yet.

## How to pick this up on a different machine

```bash
git clone https://github.com/pilshub/opencards.git
cd opencards
npm install
npm run check          # full gate: typecheck, lint, format, all tests, replay 200/200, hidden-info 2/2
```

Optional, only needed if regenerating card art: copy `.env.example` to `.env`
and set `RUNWARE_API_KEY` (a Runware.ai key — **the key used earlier in this
project's history was pasted into a chat and should be treated as
compromised; rotate it on runware.ai before reusing**). Not needed for normal
development — the 35 generated card images are already committed as static
WebP files.

To run the real-time multiplayer server locally:

```bash
npm run dev:server     # starts packages/server on :8787 (or PORT env var)
```

Then open the app, go to the Online tab, and connect two browser tabs to the
same match code with `ws://localhost:8787` as the server URL (or `ws://<lan-ip>:8787`
from a second machine on the same network).

To redeploy the app to Vercel from a fresh checkout (the `.vercel/` link is
per-machine, not committed):

```bash
vercel link --project opencards --yes   # re-links to the EXISTING project, does not create a duplicate
vercel deploy --prod --yes
```

## Where to look next

- `docs/roadmap-horizon-2.md` — the current ambitious roadmap and its
  progress log (done/paused-with-reason for every item). This is the
  authoritative "what's built vs. still ahead" list, kept current after every
  shipped slice.
- `docs/roadmap.md` — the original Phase -1..8 roadmap, now historical/complete.
- `docs/architecture.md` — layers and how the pieces fit together, including
  `packages/server`'s internal-subpath embedding pattern.
- `docs/openboard-adapter.md` — the stable public facade contract for anyone
  embedding `@opencards/core` as a library in their own project (this is the
  "yes, developers can build on this" answer — `games/quick-sparks` is the
  proof).
- `packages/server/README.md` — the WebSocket wire protocol, if working on
  multiplayer.

## Working-with-Claude notes for this repo

- Orchestration pattern used this session: plan (SPEC.md at repo root) →
  execute (`d4.bat`, DeepSeek V4 Flash) → audit independently (`npm run check`
  re-run with a captured real exit code, plus live browser verification for
  anything touching hidden information or a new security boundary). See the
  Claude memory file `opencards-orchestration-pattern.md` for the exact
  mechanics (dispatch commands, the SPEC.md-must-be-formatted-before-commit
  gotcha, Vercel re-linking after a lost worktree).
- Never commit real API keys. `.env` is gitignored; `.env.example` documents
  the variable name only.

## Sibling repos (shared engineering philosophy, separate codebases)

- `open-board`: board/card/piece MVP, already implemented.
- `openadvance`: turn-based tactics engine scaffold.
- `opencompany`: company/economy simulation engine scaffold.
- `openpuzzle`: puzzle/casual engine scaffold.
- `openrts`: deterministic RTS engine scaffold.
