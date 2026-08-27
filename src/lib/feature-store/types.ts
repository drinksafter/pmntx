export type FeatureFamily =
  | "RETURNS"
  | "MOMENTUM"
  | "VOLATILITY"
  | "VOLUME_LIQUIDITY"
  | "RELATIVE_STRENGTH"
  | "FUNDAMENTALS"
  | "EARNINGS"
  | "VALUATION"
  | "SECTOR_INDUSTRY"
  | "MACRO_RATES"
  | "ALTERNATIVE_DATA"
  | "OPTIONS_DERIVED";

export type FeatureValueInput = {
  featureCode: string;
  securityId: string;
  value: number;
  observationAt: string;
  effectiveAt?: string | null;
  publicationAt?: string | null;
  availableAt: string;
  source: string;
  sourceVersion?: string | null;
  sourceRecordId?: string | null;
  featureSchemaVersion?: string;
};

export type FeatureValueRecord = {
  id: string;
  featureCode: string;
  securityId: string;
  value: number;
  observationAt: string;
  availableAt: string;
  source: string;
};
