# Ember Duel: Foundry Set Guide

## Goal And Setup

Reduce the opposing base from 20 to 0.

Each player brings a legal 20-card deck with at most two copies of a card. The opening hand contains four cards. Ember and Verdant use different starter decks; neutral cards can appear in either faction.

The active player begins with one maximum energy. At each new turn, maximum energy grows by one up to ten and current energy refills. A player may control at most five units and hold at most ten cards.

## Turn Structure

1. **Start:** ready eligible units and draw once. Drawing from an empty deck causes increasing fatigue damage.
2. **Main:** spend energy to play units and tactics.
3. **Combat:** each ready attacker can attack one legal enemy unit or the enemy base. Unit combat damage is simultaneous.
4. **End:** temporary modifiers expire and the opponent starts a new turn.

Units normally enter exhausted by summoning sickness. Tactics enter the deterministic stack, collect a target or choice when required, resolve their effects in order, then move to discard unless an effect moves them elsewhere.

## Combat Keywords

| Keyword   | Rule                                                                  |
| --------- | --------------------------------------------------------------------- |
| Guard     | A visible Guard must be attacked before the base or a non-Guard ally. |
| Rush      | Can attack units on the turn it enters, but not the base.             |
| Charge    | Can attack any legal target on the turn it enters.                    |
| Haste     | Enters ready and can attack immediately.                              |
| Shield    | Prevents the next positive damage, then is removed.                   |
| Lifesteal | Combat damage restores that much base health to the controller.       |
| Poisonous | Combat damage that gets through destroys the damaged unit.            |
| Stealth   | Cannot be attacked or enemy-targeted until it attacks.                |

## Composable Mechanics

- Triggered abilities: on play, death, attack, turn start/end, enemy play/attack, and friendly death.
- Conditions: compare base, energy, source damage, unit count, hand size, or named counters.
- Control: frozen and stunned units lose readiness; silence removes abilities, keywords, statuses, counters, and modifiers.
- Stats: permanent or end-of-turn attack/health buffs and debuffs.
- Tokens and resurrection: summon a definition by kind or return a matching discarded unit.
- Attachments: equipment and enchantments remain attached and modify unit stats.
- Secrets: opponents see only a count; the effect stays hidden until its deterministic trigger.
- Zones: deck, hand, battlefield, stack, discard, and exile.
- Damage shapes: single target, all units, adjacent units, and seeded random legal targets.
- Choices: choose-one effects pause resolution until the controller selects an option.
- Hand pressure: discard, maximum hand size, and deterministic overdraw behavior.

The canonical operation and trigger lists live in packages/effects/src/index.ts. The engine stores every choice, random result, command, and setup option in deterministic state or replay data.

## Five Playable Lessons

1. **Your first turn:** draw, advance to Main, and play Cinder Initiate.
2. **Combat:** attack the enemy base with a ready unit.
3. **Guard and Rush:** use Spark Runner to attack the Guard that protects the base.
4. **Shield and Poisonous:** remove the Shield before Poisonous can destroy the Guardian.
5. **Tactics and targets:** cast Focused Fire on the middle unit, then resolve direct, frozen, and adjacent effects.

Each lesson is a scenario passed through normal SetupOpts. Completion is detected from real commands and state; there is no tutorial-only rules engine.

## Studio Workflow

### Create

The Visual mode covers identity, faction, type, cost, stats, keywords, triggers, operations, amount, target, and extra operation parameters. Effects sharing a trigger become one ability.

The JSON mode accepts the complete CardDefinition contract, including nested effects, conditions, secret payloads, attachments, choices, and zone movement. Invalid data cannot be saved.

### Deck

The Deck surface merges built-in and locally saved cards, enforces format size and copy limits, and persists the ordered deck locally. Cards, decks, and formats can be imported or exported independently as JSON.

### Rules And Formats

The Rules surface contains the player glossary and basic format fields. Saving a format preserves its phase order, board/hand limits, energy progression, and fatigue rules. Full format JSON can be imported through Deck.

## AI, Balance, And Replay

The Verdant AI receives only its ViewerHandle projection and legalCommands list. It cannot inspect canonical state or hidden cards.

The balance script simulates 400 seeded matches while alternating faction and seat. It fails on unresolved matches, turn caps, or a win-rate difference outside the accepted band.

Replay envelopes include seed, setup options, card specs, ruleset, commands, and final hash. Replaying the same envelope must produce the same hash. Opponent hand/deck identity and secret payloads are masked in player projections.
