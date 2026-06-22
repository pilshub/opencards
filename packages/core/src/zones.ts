import type { CardInstance, State, Zone, ZoneId } from './types.js';

/** Move a card instance between zones, preserving order and appending to the destination. */
export function moveCard(state: State, instance: CardInstance, from: ZoneId, to: ZoneId): State {
  if (from === to) {
    return state;
  }

  for (const player of Object.values(state.players)) {
    const fromZone = player[from];
    const sourceIndex = fromZone.findIndex((card) => card.id === instance.id);

    if (sourceIndex >= 0) {
      const nextFrom = fromZone.filter((card) => card.id !== instance.id);
      const nextTo = [...player[to], instance];
      const nextPlayer = { ...player, [from]: nextFrom, [to]: nextTo };
      return {
        ...state,
        players: { ...state.players, [player.id]: nextPlayer },
      };
    }
  }

  return state;
}

/** Draw the top card from a zone, returning the card and remaining zone. */
export function drawTop(zone: Zone): { readonly instance?: CardInstance; readonly zone: Zone } {
  const [instance, ...remaining] = zone;
  return instance === undefined ? { zone: remaining } : { instance, zone: remaining };
}

/** Count cards in a zone. */
export function countZone(zone: Zone): number {
  return zone.length;
}

/** Find a card instance in a zone by id. */
export function findInstance(zone: Zone, instance: CardInstance): CardInstance | undefined {
  return zone.find((card) => card.id === instance.id);
}
