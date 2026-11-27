const highestPriorityReasons: ReadonlyMap<string, string> = new Map([
  ["rodina", "rodine"],
  ["kariera", "kariére"],
  ["stabilita", "stabilite"],
  ["kreativita", "tvorivosti"],
  ["sloboda", "slobode"],
]);

export function recommendationReason(
  viewerPriority: string | undefined,
  candidatePriority: string | null,
  radiusKm: number | undefined,
  distanceKm: number | undefined,
) {
  const priority =
    viewerPriority && viewerPriority === candidatePriority
      ? highestPriorityReasons.get(viewerPriority)
      : undefined;
  if (priority) return `Obaja ste v dotazníku dali najvyššiu prioritu ${priority}.`;

  if (radiusKm === undefined || !(radiusKm > 0 && radiusKm < 500)) return null;
  if (distanceKm === undefined || !(distanceKm >= 0 && distanceKm <= radiusKm)) return null;
  const distance = distanceKm === 0 ? "menej ako 1 km" : `približne ${distanceKm} km`;
  return `Ste od seba ${distance}. Nastavený dosah je ${radiusKm} km.`;
}
