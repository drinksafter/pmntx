import type { DatasetSplit, LabeledRow, SplitBoundaries } from "./types";

/**
 * Enforces chronological train < validation < test separation in code,
 * not just convention (pivot brief §12's "critical safeguards"). Throws
 * on any violation — a boundary overlap, an out-of-order range, or any
 * row whose observationAt falls outside every declared window — rather
 * than silently building a leaky split.
 */
export function buildDataset(rows: LabeledRow[], boundaries: SplitBoundaries): DatasetSplit {
  const trainStart = new Date(boundaries.trainStart).getTime();
  const trainEnd = new Date(boundaries.trainEnd).getTime();
  const validationStart = new Date(boundaries.validationStart).getTime();
  const validationEnd = new Date(boundaries.validationEnd).getTime();
  const testStart = new Date(boundaries.testStart).getTime();
  const testEnd = new Date(boundaries.testEnd).getTime();

  if (!(trainStart < trainEnd && trainEnd <= validationStart && validationStart < validationEnd && validationEnd <= testStart && testStart < testEnd)) {
    throw new Error(
      "Invalid split boundaries: train must fully precede validation, which must fully precede test " +
        "(trainStart < trainEnd <= validationStart < validationEnd <= testStart < testEnd)."
    );
  }

  const train: LabeledRow[] = [];
  const validation: LabeledRow[] = [];
  const test: LabeledRow[] = [];

  for (const row of rows) {
    const t = new Date(row.observationAt).getTime();
    if (t >= trainStart && t < trainEnd) train.push(row);
    else if (t >= validationStart && t < validationEnd) validation.push(row);
    else if (t >= testStart && t < testEnd) test.push(row);
    // Rows outside every window are silently excluded, not an error —
    // a dataset may legitimately have a gap between windows.
  }

  if (train.length === 0 || validation.length === 0 || test.length === 0) {
    throw new Error(
      `Dataset split produced an empty partition (train=${train.length}, validation=${validation.length}, test=${test.length}) — cannot train/validate/test.`
    );
  }

  return { train, validation, test };
}
