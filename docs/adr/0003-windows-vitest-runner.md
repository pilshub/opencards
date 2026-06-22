# ADR-0003: Windows Vitest Runner

Status: Accepted

## Context

Direct package tests were restored to `vitest run --coverage` during Phase 0 gate hardening. On this Windows machine, the direct command fails before tests run because Vite asks esbuild to bundle `vitest.config.ts`, and spawning the esbuild service is denied.

Exact toolchain versions observed for this decision:

- Node.js: 24.13.0
- vitest: 2.1.9
- @vitest/coverage-v8: 2.1.9
- esbuild: 0.21.5

Reproduction:

```text
WindowsProductName : Windows 10 Pro
WindowsVersion     : 2009
Node.js v24.13.0

npm run check
> @opencards/core@0.0.0 test
> vitest run --coverage

failed to load config from C:\Users\PORTO\codex\active\opencards\.claude\worktrees\pedantic-stonebraker-67ba34\packages\core\vitest.config.ts

Startup Error
Error: spawn EPERM
    at ChildProcess.spawn (node:internal/child_process:421:11)
    at Object.spawn (node:child_process:796:9)
    at ensureServiceIsRunning (...\node_modules\esbuild\lib\main.js:1975:29)
    at build (...\node_modules\esbuild\lib\main.js:1873:26)
    at bundleConfigFile (...\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:66845:24)
    at loadConfigFromFile (...\node_modules\vite\dist\node\chunks\dep-BK3b2jBa.js:66815:27)
```

## Decision

Keep `scripts/run-vitest-package.mjs` as a Windows fallback runner for now.

The runner must:

- Import each package's `vitest.config.ts` directly and use its test and coverage settings.
- Keep per-package coverage thresholds in package Vitest configs, not in the runner.
- Avoid mutating `process.versions.node`.
- Disable Vite's config-file bundling path and esbuild transform path that trigger the local `spawn EPERM`.
- Reject top-level Vite config keys that the runner would otherwise ignore, and require ADR-0003 to be revisited before adding those keys.

## Alternatives Considered

- Direct `vitest run --coverage` per package: rejected because Vite bundles `vitest.config.ts` through esbuild, and this Windows + Node 24.13.0 + esbuild 0.21.5 toolchain fails with `spawn EPERM` before tests run.
- Pin esbuild to an older version: not adopted because the failure is in the esbuild service spawn path, pinning would add package-manager drift without proving that direct Vitest is stable on the supported Windows toolchain, and this runner avoids that spawn path entirely.
- Use Vitest in a Linux dev container: rejected because Linux CI remains sufficient as one runner, but the local development contract still requires Windows users to run the gate.

## Consequences

Package `test` scripts remain a documented deviation from direct `vitest run --coverage` until the Windows/esbuild spawn failure is gone on the supported local toolchain.

Root `engines.node` is now `>=22.6.0`, so Node 20 is no longer supported for this repository. The fallback runner imports package `vitest.config.ts` files directly and package test scripts pass `--experimental-strip-types`, which depends on native TypeScript stripping introduced in Node 22.6.0.

The runner only consumes each package config's `test` section. Adding top-level Vite keys such as `plugins`, `resolve`, or `define` now fails fast instead of silently diverging from direct Vitest behavior.
