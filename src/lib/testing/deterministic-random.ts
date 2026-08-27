/**
 * mulberry32 — a small, fast, seeded PRNG. Deterministic: the same seed
 * always produces the same sequence, which the experiment framework and
 * fixtures rely on for reproducibility (pivot brief §12 "reproducible
 * random seeds"). Not cryptographically secure — never use for anything
 * security-sensitive.
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function random(): number {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
