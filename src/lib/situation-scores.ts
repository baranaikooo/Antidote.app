export type SituationScores = [number, number, number];

export function scaleSituationWeight(weight: number, optionWeights: readonly number[]): number {
  const min = Math.min(...optionWeights);
  const max = Math.max(...optionWeights);
  return Math.round(((weight - min) / (max - min)) * 10_000);
}

export function readSituationScores(value: unknown): SituationScores | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  for (const score of value) {
    if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 10_000) {
      return undefined;
    }
  }
  return value as SituationScores;
}
