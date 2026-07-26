import type {
  EvidenceRecord,
  RecoveryAction,
  SourceExecutor,
  SourceRequest,
  SourceWarning,
} from "@sourceport/core";

export const MAX_DECISION_CONTEXT_LIMITS = {
  sourceQueries: 24,
  perQueryDocuments: 8,
  perSubjectDocuments: 20,
  totalDocuments: 80,
  detailDocuments: 30,
  commentsPerNote: 10,
} as const;

export type DecisionSourceRole =
  | "official-primary"
  | "company-primary"
  | "media-secondary"
  | "owner-platform"
  | "community"
  | "discovery";

export type DecisionDocumentStage = "seed" | "discovery" | "detail" | "comment";

export interface DecisionSubjectRelation {
  type: string;
  targetSubjectId: string;
  evidenceIds: string[];
}

export interface DecisionSubject {
  id: string;
  label: string;
  kind: string;
  aliases?: string[];
  evidenceIds: string[];
  relations?: DecisionSubjectRelation[];
  attributes?: Record<string, unknown>;
}

export interface DecisionInvestigation {
  id: string;
  label: string;
  category: string;
  subjectIds: string[];
  window: {
    from: string;
    to?: string;
  };
}

export interface DecisionSourceQuery {
  id: string;
  investigationId: string;
  subjectIds: string[];
  source: string;
  operation: string;
  parameters: unknown;
  sourceRole: DecisionSourceRole;
  required?: boolean;
}

export interface SeedDecisionDocument {
  id: string;
  source: string;
  sourceOperation: string;
  sourceRole: DecisionSourceRole;
  subjectIds: string[];
  investigationIds: string[];
  title: string;
  content: string;
  url?: string;
  sourceItemId?: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  evidenceIds: string[];
}

export interface DecisionContextLimits {
  sourceQueries: number;
  perQueryDocuments: number;
  perSubjectDocuments: number;
  totalDocuments: number;
  detailDocuments: number;
  commentsPerNote: number;
}

export interface DecisionContextBrief {
  domain: string;
  query: string;
  market?: {
    country?: string;
    city?: string;
  };
  subjects: DecisionSubject[];
  investigations: DecisionInvestigation[];
  sourceQueries: DecisionSourceQuery[];
  seedDocuments?: SeedDecisionDocument[];
  seedEvidence?: EvidenceRecord[];
  limits?: Partial<DecisionContextLimits>;
  freshness?: SourceRequest["freshness"];
  execution?: SourceRequest["execution"];
}

export interface DecisionDocument {
  id: string;
  source: string;
  sourceOperation: string;
  sourceRole: DecisionSourceRole;
  stage: DecisionDocumentStage;
  subjectIds: string[];
  investigationIds: string[];
  title: string;
  content: string;
  summary: string;
  url?: string;
  sourceItemId?: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  contentHash: string;
  evidenceIds: string[];
}

export interface DecisionQueryRecord {
  queryId: string;
  source: string;
  operation: string;
  status: "success" | "partial" | "blocked" | "failed";
  documentIds: string[];
  failureCode?: string;
}

export interface DecisionContextCoverage {
  attemptedQueries: number;
  successfulQueries: number;
  blockedQueries: number;
  failedQueries: number;
  detailCalls: number;
  documents: number;
  bySource: Record<string, number>;
  limitations: string[];
}

export interface DecisionEvidenceCorpus {
  status: "success" | "partial" | "blocked" | "failed";
  generatedAt: string;
  brief: DecisionContextBrief;
  documents: DecisionDocument[];
  queries: DecisionQueryRecord[];
  evidence: EvidenceRecord[];
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
  coverage: DecisionContextCoverage;
}

export type DecisionVerification =
  | "confirmed"
  | "supported"
  | "single-source"
  | "unverified"
  | "conflict";

export type DecisionApplicability = "direct" | "indirect" | "unknown" | "not-applicable";
export type DecisionSeverity = "critical" | "high" | "medium" | "low" | "unknown";
export type DecisionRemediation = "none" | "announced" | "in-progress" | "completed" | "unknown";
export type DecisionFlag = "context-only" | "watch" | "verify-before-buy" | "pause";

export interface DecisionEventAssessment {
  id: string;
  title: string;
  category: string;
  summary: string;
  subjectIds: string[];
  documentIds: string[];
  evidenceIds: string[];
  verification: DecisionVerification;
  applicability: DecisionApplicability;
  applicabilityBasis: string;
  severity: DecisionSeverity;
  remediation: DecisionRemediation;
  occurredAt?: string;
}

export interface OwnerSignalAssessment {
  id: string;
  topic: string;
  summary: string;
  polarity: "positive" | "negative" | "mixed";
  recurrence: "anecdotal" | "repeated" | "cross-source";
  subjectIds: string[];
  documentIds: string[];
  evidenceIds: string[];
}

export interface DecisionUnknownAssessment {
  id: string;
  question: string;
  subjectIds: string[];
  documentIds: string[];
  evidenceIds: string[];
}

export interface DecisionConflictAssessment {
  id: string;
  title: string;
  summary: string;
  subjectIds: string[];
  documentIds: string[];
  evidenceIds: string[];
}

export interface DecisionContextAssessmentInput {
  events: DecisionEventAssessment[];
  ownerSignals: OwnerSignalAssessment[];
  conflicts: DecisionConflictAssessment[];
  unknowns: DecisionUnknownAssessment[];
}

export interface CompiledDecisionEvent extends DecisionEventAssessment {
  decisionFlag: DecisionFlag;
  independentSources: number;
  dateStatus: "known" | "unknown";
}

export interface CompiledOwnerSignal extends OwnerSignalAssessment {
  distinctDocuments: number;
  distinctSources: number;
}

export interface CompiledDecisionConflict extends DecisionConflictAssessment {
  independentSources: number;
}

export interface DecisionContextReport {
  status: "success" | "partial";
  generatedAt: string;
  domain: string;
  query: string;
  subjects: DecisionSubject[];
  events: CompiledDecisionEvent[];
  ownerSignals: CompiledOwnerSignal[];
  conflicts: CompiledDecisionConflict[];
  unknowns: DecisionUnknownAssessment[];
  documents: DecisionDocument[];
  evidence: EvidenceRecord[];
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
  coverage: DecisionContextCoverage;
}

export interface DecisionContextDependencies {
  execute: SourceExecutor;
  now?: () => Date;
}

export interface DecisionValidationIssue {
  path: string;
  message: string;
}

export interface DecisionValidationResult<T> {
  ok: boolean;
  value?: T;
  issues: DecisionValidationIssue[];
}

export interface DecisionCompilationResult {
  ok: boolean;
  report?: DecisionContextReport;
  issues: DecisionValidationIssue[];
}

export function resolvedDecisionContextLimits(
  input: Partial<DecisionContextLimits> | undefined,
): DecisionContextLimits {
  return {
    sourceQueries: input?.sourceQueries ?? MAX_DECISION_CONTEXT_LIMITS.sourceQueries,
    perQueryDocuments: input?.perQueryDocuments ?? MAX_DECISION_CONTEXT_LIMITS.perQueryDocuments,
    perSubjectDocuments: input?.perSubjectDocuments ?? MAX_DECISION_CONTEXT_LIMITS.perSubjectDocuments,
    totalDocuments: input?.totalDocuments ?? MAX_DECISION_CONTEXT_LIMITS.totalDocuments,
    detailDocuments: input?.detailDocuments ?? MAX_DECISION_CONTEXT_LIMITS.detailDocuments,
    commentsPerNote: input?.commentsPerNote ?? MAX_DECISION_CONTEXT_LIMITS.commentsPerNote,
  };
}
