# @opencards/app

The React product surface for OpenCards Foundry.

## Surfaces

- Play: Ember Duel against the Verdant AI, deterministic scenarios, replay export/import, logs, and perspective-safe board views.
- Deck: deck construction, live legality, copy counts, local persistence, and JSON import/export.
- Create: visual card authoring plus advanced JSON for nested conditions, choices, secrets, attachments, zones, and statuses.
- Rules: integrated Foundry rulebook, mechanics glossary, and format editor.

The UI reads only viewMatch(handle) and legalCommands(handle). Every action button is backed by a legal engine command; opponent hidden zones remain masked.

## Development

    npm run dev --workspace=@opencards/app -- --host 127.0.0.1 --port 5180
    npm test --workspace=@opencards/app
    npm run test:e2e --workspace=@opencards/app

The root npm run verify:mvp includes the app build, static smoke, and seven Playwright product flows.
