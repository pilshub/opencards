# ADR-0007: Browser-Compatible Hash

## Status

Accepted on 2026-06-09.

## Context

`hashState` was using `node:crypto` for sha256. Phase 5 needs the same hash to run in browser bundles for the demo and any future client-side replay verification.

## Decision

1. Replace `node:crypto` with `@noble/hashes` for sha256.
2. Keep canonical JSON as the same byte-stable serialization.
3. Keep `hashState` synchronous with no async cascade because the dispatcher and replay verifier are synchronous.
4. Treat `@noble/hashes` as the only runtime dependency allowed in `@opencards/core`; future additions still require an ADR.

## Alternatives Considered

1. Web Crypto API. Rejected because it is async and would cascade through the dispatcher and replay verifier.
2. `vite-plugin-node-polyfills`. Rejected because it bloats the browser bundle and adds Vite plugin overhead.
3. Hand-roll sha256. Rejected because rolling crypto is a known antipattern and `@noble/hashes` is audited.

## Consequences

1. Replay fixture hashes are unchanged because sha256 output is implementation-independent for the same canonical JSON bytes.
2. The ESLint `Math.random` rule stays applicable in `@opencards/core` and `@opencards/effects`; `@noble/hashes` uses deterministic operations only.
3. Bundle size impact on `@opencards/app` is about 5kB minified.
4. Future browser hashing additions can follow the same pattern.
