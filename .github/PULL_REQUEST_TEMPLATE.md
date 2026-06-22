<!-- See docs/dev-system.md for the full PR contract. -->

## Roadmap phase advanced

<!-- e.g. Phase 1, Phase 3 -->

## Exit criteria touched

<!-- Quote the bullet(s) from docs/roadmap.md this PR advances or completes. -->

## ADR added or referenced

<!-- New ADR? Link it. Existing ADR enforced? Link it. None? Justify. -->

## Replay fixture changes

<!--
- None
- or: "fixtures/replays/<name>.json regenerated because <reason>; hash bumped from <old> to <new>."
-->

## Hidden-information impact

<!--
- None
- or: "Added `<field>` to `getView`; verify-hidden-info still passes."
-->

## Quality gate

- [ ] `npm run check` is green locally.
- [ ] No new `console.log` left in committed code.
- [ ] No new direct dependency in `packages/core`.
- [ ] Coverage floors per `docs/dev-system.md` still hold.
