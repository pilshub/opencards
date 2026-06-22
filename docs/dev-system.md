# 100/10 Development & Testing System

A development and testing standard for OpenCards. Not generic Node hygiene — specific to a deterministic card-game engine where the replay invariant is the product.

## What "100/10" means here

A development system scores 100/10 when:

1. The replay invariant is continuously and automatically verified, not just hoped for.
2. Hidden information leakage is caught by tests, not by code review.
3. Card data is validated in two layers (schema + runtime) and adding a card requires no engine edits.
4. The full quality gate is one command and runs under five minutes locally.
5. No phase of work ships until the gate is green.
6. Every architectural decision lives in an ADR. No decision happens in a PR description.
7. Every test has a reason to exist. No snapshot dumps, no "asserts the obvious".

## Pillars

### 1. Workspace structure

- npm workspaces. Five packages: `core`, `schema`, `effects`, `simulator`, `app`.
- Root `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`.
- Per-package `tsconfig.json` extends the base and declares `references` for internal deps.
- Per-package `package.json` declares its own `exports`, `types`, `scripts`.
- No deep imports across package boundaries. Only `import { x } from '@opencards/core'`.

### 2. Quality gate

Single command: `npm run check`. ADR-0004 defines the Phase 0 deferral of replay and hidden-information checks.

Phase 0 gate runs in order:

1. `typecheck` — `tsc -b` across all packages.
2. `lint` — eslint with `--max-warnings 0`.
3. `format:check` — prettier in check mode.
4. `test` — vitest per package with coverage through the Windows-safe package runner.
5. `verify:coverage-overall` — aggregate coverage floor across packages.

Phase 1+ gate runs in order:

1. `typecheck` — `tsc -b` across all packages.
2. `lint` — eslint with `--max-warnings 0`.
3. `format:check` — prettier in check mode.
4. `test` — vitest per package with coverage.
5. `verify:coverage-overall` — aggregate coverage floor across packages.
6. `verify:replay` — N-seed determinism matrix (Pillar 5).
7. `verify:hidden-info` — leakage tests (Pillar 6).

Whole gate finishes under five minutes on a dev laptop. Each step has a timeout.

Once Phase 7 lands, `verify:mvp` will run `check` + simulator batch + app build + Playwright smoke + pixel snapshot diff; CI and release will use it.
`verify:mvp` is itself a deferred command until Phase 7; running it today fails fast by design, following the ADR-0004 deferral pattern.

### 3. Test pyramid

| Layer         | Tool                      | Purpose                                                     | Lives in                       |
| ------------- | ------------------------- | ----------------------------------------------------------- | ------------------------------ |
| Unit          | vitest                    | Pure functions, type narrowing, single-module behavior      | Every package                  |
| Property      | fast-check                | Invariants over generated inputs (RNG, shuffle, dispatcher) | `core`                         |
| Integration   | vitest                    | Multi-module flows: setup → play → replay → hash match      | `core`, `effects`, `simulator` |
| Replay matrix | vitest + harness          | N seeds × scripted command lists; bit-identical hashes      | `simulator`                    |
| Hidden info   | vitest                    | `getView` projection vs canonical state                     | `core`, `app`                  |
| Fuzz          | fast-check + harness      | Bots emit only legal commands; engine never throws          | `simulator`                    |
| End-to-end    | playwright                | Full match in browser, replay import/export                 | `app`                          |
| Visual        | playwright pixel snapshot | Canonical UI states stable across runs                      | `app`                          |

Coverage floors: `core` 90%, `effects` 85%, `schema` 85%, `simulator` 80%, `app` 70%, overall 80%. Below floor = red.

### 4. Development workflow

- Branch from `main`. Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Pre-commit hook (husky + lint-staged): `prettier --write` + `eslint --fix` + `npm run test`.
- Pre-push hook: full `npm run check`.
- PR template includes: which roadmap phase, which exit criteria advanced, whether an ADR was added or referenced, replay-fixture changes if any.
- No squash merge. The history is the design log.

### 5. Determinism harness

A first-class test type, not an afterthought.

- `verify:replay` runs every canonical fixture × seeds 0..N (N=99 in dev, 999 in CI).
- For each combination: setup → apply scripted commands → compute final hash → assert match against the recorded hash.
- A code change that legitimately changes hashes must bump the recorded fixture in the same commit. The diff makes intent explicit.
- Replay envelopes live as JSON fixtures in `packages/simulator/fixtures/replays/`. Git-tracked, reviewed.

### 6. Hidden-information enforcement

Automated, not aspirational.

- Engine: `getView(playerId)` is the only outward read path from `core`. A lint rule forbids exporting raw `state` from `core/src/index.ts`.
- Engine test: for every fixture, snapshot `getView(p1)` and `getView(p2)`. Assert opponent hand and deck identities are masked.
- App test: Playwright applies a command, dumps `document.body.innerHTML`, and asserts opponent card kinds do not appear.

### 7. Documentation contract

- Every architectural decision: ADR in `docs/adr/NNNN-title.md`. Status, context, decision, alternatives, consequences.
- Every card-data field: documented in the JSON schema + runtime validator with a stable issue code.
- Every public package export: TSDoc with at least a one-line summary.
- Runbooks in `docs/runbooks/`:
  - `add-a-card.md`
  - `add-an-effect-op.md`
  - `debug-a-replay-mismatch.md`
  - `add-a-phase.md`

### 8. Performance budgets

- Bundle: `app` production build ≤ 250 KB gzipped (Phase 5 baseline; revisit at Phase 6).
- Simulator: 1000-seed Ember Duel batch in ≤ 10 s on the dev laptop.
- Replay verify: a 30-command replay verifies in ≤ 100 ms.

Budget breach = red gate.

## File layout (target end state of Phase 0)

```text
opencards/
├── docs/
│   ├── adr/
│   │   ├── 0001-frontend-stack.md
│   │   ├── 0002-effect-dsl-v1.md
│   │   ├── 0003-windows-vitest-runner.md
│   │   └── 0004-dev-system-phase-0-deferrals-and-runner.md
│   ├── runbooks/
│   │   ├── add-a-card.md
│   │   ├── add-an-effect-op.md
│   │   ├── add-a-phase.md
│   │   └── debug-a-replay-mismatch.md
│   ├── architecture.md
│   ├── dev-system.md
│   ├── mvp-goal.md
│   ├── roadmap.md
│   └── session-handoff.md
├── examples/
│   └── starter-deck.json
├── packages/
│   ├── README.md
│   ├── core/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       └── index.test.ts
│   ├── schema/      (same layout, including vitest.config.ts)
│   ├── effects/     (same layout, including vitest.config.ts)
│   ├── simulator/   (same layout, including vitest.config.ts)
│   └── app/         (same layout, including README.md and vitest.config.ts)
├── scripts/
│   ├── check-overall-coverage.mjs
│   ├── run-vitest-package.mjs
│   ├── verify-replay.mjs
│   └── verify-hidden-info.mjs
├── .github/
│   └── PULL_REQUEST_TEMPLATE.md
├── .husky/
│   ├── pre-commit
│   └── pre-push
├── eslint.config.js
├── .prettierrc.json
├── .prettierignore
├── .editorconfig
├── tsconfig.base.json
├── tsconfig.json
├── package.json
├── package-lock.json
└── README.md
```

## Anti-patterns explicitly banned

- Snapshot tests that snapshot huge JSON blobs nobody reads. Over 50 lines = smell.
- `expect(x).toBeDefined()` style assertions that pass for any non-undefined value.
- Test files importing from another test file.
- `Math.random` anywhere in `core` or `effects`. Lint rule enforced.
- New direct runtime dependencies in `core` without an ADR.
- Committed `console.log` debug. ESLint `no-console` on; allowed only in `scripts/`.

## Out of scope for v1 of this system

- Mutation testing (Stryker). Revisit after coverage floors hold for two months.
- Visual regression beyond a small canonical set.
- Load testing.
- Multi-OS CI matrix. One Linux runner is enough for MVP.

## How to evolve this document

A change to this system is itself an ADR. File `docs/adr/NNNN-dev-system-<change>.md`, then update this document. No silent changes to the standard.
