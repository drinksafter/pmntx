import { createSeededRandom } from "@/lib/testing/deterministic-random";

import type { LabeledRow } from "./types";

/**
 * Deterministic synthetic labeled dataset: two features (a "momentum"-like
 * signal and a noise feature) with a genuine, seeded, mildly-predictive
 * relationship to the label — enough that logistic regression can
 * legitimately learn to beat the naive majority-class baseline, without
 * being a trivial 100%-separable toy that proves nothing. Same seed
 * always produces the same dataset (pivot brief §12 reproducibility).
 */
export function generateSyntheticLabeledDataset(
  seed: number,
  count: number,
  startDateIso: string,
  daySpacingDays: number
): LabeledRow[] {
  const random = createSeededRandom(seed);
  const rows: LabeledRow[] = [];
  const start = new Date(startDateIso).getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const momentumSignal = (random() - 0.5) * 2; // [-1, 1]
    const noiseFeature = (random() - 0.5) * 2;
    // Genuine but noisy relationship: positive momentum -> more likely a
    // positive label, with enough random flips that naive-majority isn't
    // trivially beaten by chance alone.
    const positiveProbability = 0.5 + momentumSignal * 0.25;
    const label = random() < positiveProbability ? 1 : 0;

    rows.push({
      securityId: `SYNTHETIC_${i % 20}`, // 20 distinct synthetic securities, reused across observations
      observationAt: new Date(start + i * daySpacingDays * dayMs).toISOString(),
      features: [momentumSignal, noiseFeature],
      label,
    });
  }
  return rows;
}
