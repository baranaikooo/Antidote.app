/** Generates a stable visual bar pattern when encoded audio peaks are unavailable. */
export function buildDeterministicWaveform(seed: string, barCount = 24, weight = 0): number[] {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Array.from({ length: barCount }, (_, idx) => {
    const wave = Math.abs(Math.sin((idx + 1) * 0.65 + weight * 0.4 + (hash % 17)));
    const detail = ((hash >>> (idx % 16)) & 7) / 14;
    return Math.min(1, Math.max(0.18, wave * 0.68 + detail * 0.32));
  });
}
