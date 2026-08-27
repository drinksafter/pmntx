export type CostCategory =
  | "AI_INFERENCE"
  | "FEATURE_COMPUTE"
  | "QUANT_SCORING"
  | "TRAINING_COMPUTE"
  | "STORAGE"
  | "MARKET_DATA_SUBSCRIPTION"
  | "ALT_DATA_SUBSCRIPTION"
  | "SCHEDULED_COMPUTE"
  | "OTHER";

export type CostLedgerEntryInput = {
  provider: string;
  category: CostCategory;
  modelVersionId?: string | null;
  agentId?: string | null;
  securityId?: string | null;
  researchRunId?: string | null;
  experimentRunId?: string | null;
  predictionId?: string | null;
  aiExecutionId?: string | null;
  workflowId?: string | null;
  estimatedCostUsd?: number | null;
  actualCostUsd?: number | null;
  costDate?: string;
};

export type CostBreakdownDimension = "provider" | "category" | "model_version_id" | "agent_id" | "workflow_id";

export type CostBreakdownRow = { key: string; totalEstimatedUsd: number; totalActualUsd: number; entryCount: number };
