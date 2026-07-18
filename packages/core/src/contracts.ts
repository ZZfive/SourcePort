export const SOURCE_STATUSES = ["success", "partial", "stale", "blocked", "failed"] as const;

export type SourceStatus = (typeof SOURCE_STATUSES)[number];

export const SOURCE_FAILURE_CODES = [
  "invalid_request",
  "unsupported_source",
  "unsupported_operation",
  "unsupported_parameter",
  "auth_required",
  "human_verification_required",
  "rate_limited",
  "access_blocked",
  "network_error",
  "timeout",
  "source_drift",
  "unexpected_source_shape",
  "empty_source_result",
  "evidence_requirement_unmet",
  "backend_unavailable",
  "internal_error",
] as const;

export type SourceFailureCode = (typeof SOURCE_FAILURE_CODES)[number];

export type SourceFailureStage =
  | "validation"
  | "selection"
  | "transport"
  | "classification"
  | "parsing"
  | "evidence";

export interface SourceRequest {
  requestId?: string;
  source: string;
  operation: string;
  parameters: unknown;
  operationSchemaVersion?: string;
  preferredBackends?: string[];
  freshness?: {
    mode: "live" | "prefer-live" | "allow-stale";
    maxAgeMs?: number;
  };
  evidence?: {
    includeRawArtifact?: boolean;
    minimum: "provenance" | "source-fragment" | "raw-artifact";
  };
  execution?: {
    timeoutMs?: number;
    retryBudget?: number;
    allowHumanAssistance?: boolean;
  };
}

export interface EvidenceRecord {
  id: string;
  source: string;
  operation: string;
  backend: string;
  retrievedAt: string;
  sourceUrl?: string;
  sourceId?: string;
  market?: string;
  fragment?: unknown;
  artifactRef?: string;
  artifactHash?: string;
  verification: "claimed" | "source-verified" | "cross-verified";
}

export interface SourceWarning {
  code: string;
  message: string;
  field?: string;
  evidenceIds?: string[];
}

export interface SourceFailure {
  code: SourceFailureCode;
  message: string;
  stage: SourceFailureStage;
  retryable: boolean;
  backend?: string;
}

export interface RecoveryAction {
  kind:
    | "retry"
    | "switch_backend"
    | "login"
    | "complete_human_verification"
    | "allow_stale_cache"
    | "reconfigure"
    | "report_source_drift";
  description: string;
  requiresUser: boolean;
  backend?: string;
  resumeToken?: string;
}

export interface SourceResult<T = unknown> {
  requestId: string;
  source: string;
  operation: string;
  operationSchemaVersion: string;
  status: SourceStatus;
  data?: T;
  backend?: string;
  retrievedAt?: string;
  freshness?: {
    isLive: boolean;
    ageMs?: number;
  };
  evidence: EvidenceRecord[];
  warnings: SourceWarning[];
  failure?: SourceFailure;
  recoveryActions: RecoveryAction[];
}

export interface ValidationIssue {
  path: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

export type RequestValidationResult =
  | { ok: true; value: SourceRequest }
  | { ok: false; failure: SourceFailure; issues: ValidationIssue[] };
