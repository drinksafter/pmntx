export type SignalDirection = "BULLISH" | "BEARISH" | "NEUTRAL";

export type HunterSignal = {
  securityId: string;
  asOfDate: string; // YYYY-MM-DD
  signalDirection: SignalDirection;
  rawValue?: number;
  normalizedScore: number; // -1..1, enforced by hunter_results' CHECK constraint
  confidence: number; // 0..1
  dataQuality: number; // 0..1
  evidence: Record<string, unknown>;
  explanation?: string;
  sourceRecordId?: string;
};

/** Every Hunter (docs/PHASE_1A_PLAN.md §3) implements this shape. `code` must match a hunter_definitions.code row. */
export interface HunterImplementation {
  code: string;
  version: string;
  run(asOfDate: string): Promise<HunterSignal[]>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampScore(value: number): number {
  return clamp(value, -1, 1);
}

export function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}
