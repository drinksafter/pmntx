import { describe, expect, it } from "vitest";

import { computeModelDisagreement } from "./disagreement";

describe("candidates/disagreement", () => {
  it("returns null when fewer than 2 models scored a security", () => {
    expect(computeModelDisagreement([])).toBeNull();
    expect(computeModelDisagreement([{ modelCode: "A", score: 0.5 }])).toBeNull();
  });

  it("returns 0 when all contributing models agree exactly", () => {
    expect(
      computeModelDisagreement([
        { modelCode: "A", score: 0.5 },
        { modelCode: "B", score: 0.5 },
      ])
    ).toBe(0);
  });

  it("returns a larger value the more models disagree", () => {
    const small = computeModelDisagreement([
      { modelCode: "A", score: 0.5 },
      { modelCode: "B", score: 0.55 },
    ]);
    const large = computeModelDisagreement([
      { modelCode: "A", score: -0.9 },
      { modelCode: "B", score: 0.9 },
    ]);
    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large!).toBeGreaterThan(small!);
  });
});
