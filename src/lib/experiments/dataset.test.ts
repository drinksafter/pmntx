import { describe, expect, it } from "vitest";

import { generateSyntheticLabeledDataset } from "./fixtures";
import { buildDataset } from "./dataset";

const VALID_BOUNDARIES = {
  trainStart: "2025-01-01T00:00:00.000Z",
  trainEnd: "2025-06-01T00:00:00.000Z",
  validationStart: "2025-06-01T00:00:00.000Z",
  validationEnd: "2025-08-01T00:00:00.000Z",
  testStart: "2025-08-01T00:00:00.000Z",
  testEnd: "2025-10-01T00:00:00.000Z",
};

describe("experiments/dataset", () => {
  const rows = generateSyntheticLabeledDataset(1, 500, "2025-01-01T00:00:00.000Z", 0.5);

  it("splits rows chronologically into train/validation/test", () => {
    const split = buildDataset(rows, VALID_BOUNDARIES);
    expect(split.train.length).toBeGreaterThan(0);
    expect(split.validation.length).toBeGreaterThan(0);
    expect(split.test.length).toBeGreaterThan(0);

    const maxTrain = Math.max(...split.train.map((r) => new Date(r.observationAt).getTime()));
    const minValidation = Math.min(...split.validation.map((r) => new Date(r.observationAt).getTime()));
    const maxValidation = Math.max(...split.validation.map((r) => new Date(r.observationAt).getTime()));
    const minTest = Math.min(...split.test.map((r) => new Date(r.observationAt).getTime()));
    expect(maxTrain).toBeLessThanOrEqual(minValidation);
    expect(maxValidation).toBeLessThanOrEqual(minTest);
  });

  it("[property #11] identical seed produces an identical split", () => {
    const rowsA = generateSyntheticLabeledDataset(7, 600, "2025-01-01T00:00:00.000Z", 0.5);
    const rowsB = generateSyntheticLabeledDataset(7, 600, "2025-01-01T00:00:00.000Z", 0.5);
    expect(rowsA).toEqual(rowsB);

    const splitA = buildDataset(rowsA, VALID_BOUNDARIES);
    const splitB = buildDataset(rowsB, VALID_BOUNDARIES);
    expect(splitA).toEqual(splitB);
  });

  it("a different seed produces a different dataset", () => {
    const rowsA = generateSyntheticLabeledDataset(1, 200, "2025-01-01T00:00:00.000Z", 0.5);
    const rowsC = generateSyntheticLabeledDataset(2, 200, "2025-01-01T00:00:00.000Z", 0.5);
    expect(rowsA).not.toEqual(rowsC);
  });

  it("throws when validation overlaps train (chronological-split violation)", () => {
    expect(() =>
      buildDataset(rows, { ...VALID_BOUNDARIES, validationStart: "2025-03-01T00:00:00.000Z" })
    ).toThrow(/train must fully precede validation/i);
  });

  it("throws when test precedes validation", () => {
    expect(() =>
      buildDataset(rows, { ...VALID_BOUNDARIES, testStart: "2025-07-01T00:00:00.000Z", testEnd: "2025-07-15T00:00:00.000Z" })
    ).toThrow(/validation.*precede.*test|train must fully precede/i);
  });

  it("throws on an empty partition rather than silently proceeding", () => {
    expect(() =>
      buildDataset([], VALID_BOUNDARIES)
    ).toThrow(/empty partition/i);
  });
});
