import type { ForecastHorizon } from "@/lib/supabase/types";

export type ModelType =
  | "NAIVE_BASELINE"
  | "DETERMINISTIC_FACTOR"
  | "LINEAR"
  | "LOGISTIC"
  | "TREE_BOOSTING"
  | "NEURAL"
  | "PMNTX_CORE"
  | "LLM_ANALYST"
  | "SPECIALIST_AGENT"
  | "ENSEMBLE";

export type ModelStatus = "EXPERIMENTAL" | "VALIDATED" | "SHADOW" | "PAPER" | "PRODUCTION" | "RETIRED";

export type ModelCostClass = "FREE" | "CHEAP" | "MODERATE" | "EXPENSIVE";

export type ModelVersionRef = { id: string; modelId: string };

export type RegisterModelInput = {
  code: string;
  name: string;
  modelType: ModelType;
  description?: string;
};

export type RegisterModelVersionInput = {
  modelId: string;
  version: string;
  horizons?: ForecastHorizon[];
  requiredFeatureSchemaVersion?: string;
  costClass?: ModelCostClass;
  estimatedInferenceCostUsd?: number;
  config?: Record<string, unknown>;
};
