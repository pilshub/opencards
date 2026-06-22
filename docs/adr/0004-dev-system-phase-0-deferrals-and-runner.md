# ADR-0004: Dev System Phase 0 Deferrals and Runner

## Status

Superseded by Phase 1 implementation on 2026-06-09.

## Context

Phase 0 cannot honestly ship `verify:replay` and `verify:hidden-info` as real `npm run check` checks yet. The deterministic engine, replay fixture harness, and player view projection they would verify are Phase 1+ work, so including those commands in the Phase 0 gate would either fail for missing product surface or pass as no-ops.

ADR-0003 also introduced a Windows Vitest workaround after direct Vitest execution failed on the supported local Windows toolchain. That workaround added `scripts/run-vitest-package.mjs`, `scripts/check-overall-coverage.mjs`, and `docs/adr/0003-windows-vitest-runner.md`; the development system file layout had not been updated to include them and still listed a deleted root `vitest.config.ts`.

## Decision

1. Defer `verify:replay` and `verify:hidden-info` from `npm run check` during Phase 0. Re-add them in Phase 1 when the engine and view exist. They remain available as standalone npm scripts.
2. Update the file layout in `docs/dev-system.md` to reflect the actual current Phase 0 tree, including the Windows Vitest runner, overall coverage script, ADR-0003, ADR-0004, and per-package Vitest configs.
3. Keep the pre-commit hook on `lint-staged` plus `npm run test`, so local commits use the same custom runner path as package test scripts on Windows.
4. `verify:mvp` is deferred to Phase 7 by the same falsely-green-verifier rule that defers `verify:replay` and `verify:hidden-info`.

## Alternatives Considered

- Keep `verify:replay` and `verify:hidden-info` in `check` with no-op exits: rejected because it makes the gate falsely green for behavior that does not exist yet.
- Implement minimal versions now: rejected because it would require partial Phase 1 engine/view work and pollute the engine boundary before the core design is ready.
- Keep direct `npx vitest run --changed HEAD --passWithNoTests` in pre-commit: rejected because ADR-0003 documents that direct Vitest fails on the supported Windows path, and a hook should not use a different runner from the package scripts.
- Remove tests from pre-commit entirely: rejected for Phase 0 because the sentinel package tests are fast and keeping them catches local breakage before push.

## Consequences

- The README and development docs must clearly state that the Phase 0 gate covers typecheck, lint, format, package tests, and overall coverage, while replay and hidden-info verification are deferred until Phase 1+.
- Any future change to `docs/dev-system.md` still requires another ADR before the document changes.
- `npm run check` is honest for Phase 0 instead of claiming coverage for replay or hidden-information behavior that has not been implemented.
- Pre-commit takes longer than lint-only hooks, but it uses the same Windows-safe runner as the normal test script.

## Lift

Phase 1 now replaces the deferred replay and hidden-information checks with real implementations in `scripts/verify-replay.mjs` and `scripts/verify-hidden-info.mjs`. The replay kernel and projection boundary are implemented in `packages/core/src/replay.ts` and `packages/core/src/view.ts`, and both checks are part of `npm run check` in the Phase 1+ order documented by `docs/dev-system.md:46-47`.

The `verify:mvp` deferral remains in force until Phase 7.
