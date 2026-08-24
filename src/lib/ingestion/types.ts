export type IngestionOutcome = {
  status: "SUCCEEDED" | "FAILED" | "PARTIAL" | "NOT_CONFIGURED";
  recordsIngested: number;
  errorMessage?: string;
};
