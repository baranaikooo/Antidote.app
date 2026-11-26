// Database order for profiles.priority_distribution. Keep this stable if the UI is rearranged.
const PRIORITIES = ["rodina", "kariera", "stabilita", "kreativita", "sloboda"] as const;

export type PriorityDistribution = [number, number, number, number, number];

export function readPriorityDistribution(value: unknown): PriorityDistribution | undefined {
  if (!Array.isArray(value) || value.length !== PRIORITIES.length) return undefined;

  let total = 0;
  for (const tokenCount of value) {
    if (
      typeof tokenCount !== "number" ||
      !Number.isInteger(tokenCount) ||
      tokenCount < 0 ||
      tokenCount > 5
    ) {
      return undefined;
    }
    total += tokenCount;
  }
  return total === 10 ? (value as PriorityDistribution) : undefined;
}

export function priorityDistributionFromPercentages(values: Record<string, number>) {
  return readPriorityDistribution(PRIORITIES.map((key) => values[key] / 10));
}
