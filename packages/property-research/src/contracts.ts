import type {
  EvidenceRecord,
  RecoveryAction,
  SourceWarning,
  SourceResult,
  SourceExecutor,
} from "@sourceport/core";

export const PROPERTY_RESEARCH_LIMITS = {
  initialCandidates: 64,
  evaluatedCandidates: 64,
  finalCandidates: 8,
} as const;

export interface PropertyResearchLimits {
  initialCandidates: number;
  evaluatedCandidates: number;
  finalCandidates: number;
}

export type PropertyKind = "new" | "resale";
export type CriterionStatus = "pass" | "fail" | "unknown" | "conflict" | "unsupported";
export type PropertyEligibility = "eligible" | "needs-verification" | "rejected";
export type PropertyPriceKind = "asking" | "transaction" | "offer" | "tax-assessment";

export interface PropertyPriceObservation {
  id: string;
  kind: PropertyPriceKind;
  priceCny: MoneyRange;
  source: string;
  sourceUrl?: string;
  observedAt: string;
  verification?: EvidenceRecord["verification"];
  scope?: string;
}

export type PropertyCostComponent =
  | "purchase-price"
  | "deed-tax"
  | "vat"
  | "agency-fee"
  | "registration"
  | "maintenance-fund"
  | "renovation"
  | "parking"
  | "loan-fee"
  | "furnishings"
  | "seller-tax"
  | "other";

export interface MoneyRange {
  minimumCny: number;
  maximumCny: number;
}

export interface PropertyCriterion {
  key: string;
  label: string;
  kind: "hard" | "preference" | "context";
  priority: number;
  requirement: unknown;
}

export interface CommuteAnchor {
  id: string;
  label: string;
  priority?: "primary" | "secondary";
}

export interface PropertyCostEvidence {
  id: string;
  component: PropertyCostComponent;
  minimumCny: number;
  maximumCny: number;
  mandatory: boolean;
  source: string;
  sourceUrl?: string;
  retrievedAt: string;
  market?: string;
  applicability: string;
  candidateId?: string;
  validUntil?: string;
  verification?: EvidenceRecord["verification"];
}

export interface PropertyRiskEvidence {
  id: string;
  category:
    | "ownership"
    | "encumbrance"
    | "transaction-restriction"
    | "presale-permit"
    | "delivery"
    | "school"
    | "planning"
    | "property-management"
    | "other";
  status: "clear" | "issue" | "unknown";
  summary: string;
  source: string;
  sourceUrl?: string;
  retrievedAt: string;
  market?: string;
  candidateId?: string;
  validUntil?: string;
  verification?: EvidenceRecord["verification"];
}

export interface PropertyResearchBrief {
  query: string;
  market: { city: string; country?: string };
  housingTypes: PropertyKind[];
  budget: {
    maximumAllInCny: number;
    maximumPurchaseCny?: number;
    basis: "all-in";
  };
  layout?: {
    bedrooms?: number;
    livingRooms?: number;
  };
  commuteAnchors: CommuteAnchor[];
  financing?: {
    downPaymentRatios: number[];
    annualRates: number[];
    termsMonths: number[];
  };
  criteria?: PropertyCriterion[];
  limits?: Partial<PropertyResearchLimits>;
}

export interface PropertyListing {
  listingId: string;
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  title?: string;
  publishedAt?: string;
  priceCny?: MoneyRange;
  status?: "available" | "reserved" | "sold" | "unknown";
}

export interface PropertyCandidateInput {
  candidateId: string;
  kind: PropertyKind;
  city: string;
  district?: string;
  community: string;
  address?: string;
  building?: string;
  unit?: string;
  room?: string;
  areaSqm?: number;
  bedrooms?: number;
  livingRooms?: number;
  floor?: string;
  constructionYear?: number;
  propertyRightsYears?: number;
  developer?: string;
  deliveryDate?: string;
  listing?: PropertyListing;
  listings?: PropertyListing[];
  /** Current public asking price; never treated as a transaction price. */
  askingPrice?: MoneyRange;
  priceObservations?: PropertyPriceObservation[];
  fieldEvidence?: Record<string, string[]>;
  /** Verified transaction or explicitly documented offer price. */
  purchasePrice?: MoneyRange;
  costEvidence?: PropertyCostEvidence[];
  riskEvidence?: PropertyRiskEvidence[];
  commuteMinutes?: Record<string, number>;
  commuteEvidence?: Record<string, string[]>;
  evidence?: EvidenceRecord[];
  sourceUrls?: string[];
  observations?: PropertyCandidateInput[];
}

export interface PropertyCostComponentResult {
  component: PropertyCostComponent;
  range: MoneyRange;
  mandatory: boolean;
  source: string;
  applicability: string;
  evidenceIds: string[];
}

export interface PropertyCostResult {
  status: "known" | "estimate" | "unknown" | "conflict";
  verifiedLowerBoundCny: number;
  excludedEvidence: Array<{ id: string; reason: string }>;
  range?: MoneyRange;
  estimateRange?: MoneyRange;
  components: PropertyCostComponentResult[];
  missingComponents: PropertyCostComponent[];
  reasons: string[];
  evidenceIds: string[];
}

export interface MortgageScenario {
  downPaymentRatio: number;
  annualRate: number;
  termMonths: number;
  purchasePriceCny: number;
  downPaymentCny: number;
  principalCny: number;
  monthlyPaymentCny: number;
  totalInterestCny: number;
  upfrontCny?: MoneyRange;
}

export interface FinancingResult {
  status: "scenario" | "unknown";
  scenarios: MortgageScenario[];
  reasons: string[];
}

export interface CommuteResult {
  anchorId: string;
  label: string;
  minutes?: number;
  status: "known" | "unknown";
  evidenceIds: string[];
}

export interface CriterionResult {
  criterion: PropertyCriterion;
  status: CriterionStatus;
  message: string;
  evidenceIds: string[];
}

export interface PropertyCandidate {
  candidateId: string;
  eligibility: PropertyEligibility;
  kind: PropertyKind;
  identity: {
    city: string;
    district?: string;
    community: string;
    address?: string;
    building?: string;
    unit?: string;
    room?: string;
  };
  attributes: {
    areaSqm?: number;
    bedrooms?: number;
    livingRooms?: number;
    floor?: string;
    constructionYear?: number;
    propertyRightsYears?: number;
    developer?: string;
    deliveryDate?: string;
  };
  listings: PropertyListing[];
  askingPrice?: MoneyRange;
  priceObservations: PropertyPriceObservation[];
  purchasePrice?: MoneyRange;
  allInCost: PropertyCostResult;
  financing: FinancingResult;
  commute: CommuteResult[];
  risks: PropertyRiskEvidence[];
  dueDiligence: CriterionResult[];
  observations: PropertyCandidateInput[];
  conflicts: Array<{ field: string; values: unknown[] }>;
  commuteSummary: { worstMinutes?: number; meanMinutes?: number; complete: boolean };
  actionItems: string[];
  criterionResults: CriterionResult[];
  evidenceIds: string[];
  sourceUrls: string[];
}

export interface PropertyCoverage {
  mode: "bounded";
  limits: PropertyResearchLimits;
  inputCandidates: number;
  deduplicatedCandidates: number;
  evaluatedCandidates: number;
  displayedCandidates: number;
  byKind: Record<PropertyKind, { input: number; evaluated: number; displayed: number }>;
  exclusions: Array<{ candidateId: string; reason: string }>;
  limitations: string[];
}

export interface PropertyResearchReport {
  status: "success" | "partial" | "failed";
  query: string;
  market: { city: string; country?: string };
  generatedAt: string;
  candidates: PropertyCandidate[];
  rejected: PropertyCandidate[];
  allCandidates: PropertyCandidate[];
  brief?: PropertyResearchBrief;
  coverage: PropertyCoverage;
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
  evidence: EvidenceRecord[];
  failure?: { code: "invalid_brief" | "invalid_candidates" | "no_candidates"; message: string; issues?: Array<{ path: string; message: string }> };
}

export interface PropertyResearchDependencies {
  now?: () => Date;
  candidates?: unknown;
}

export interface PropertyDiscoveryRequest {
  source: string;
  operation: "search-listings" | "get-route-evidence" | "record-observation";
  parameters: Record<string, unknown>;
}

export interface PropertyDiscoveryResult {
  status: "success" | "partial" | "failed";
  candidates: PropertyCandidateInput[];
  sourceResults: SourceResult[];
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
}

export interface PropertyDiscoveryDependencies {
  execute: SourceExecutor;
  now?: () => Date;
}

export function resolvedPropertyLimits(input?: PropertyResearchBrief["limits"]): PropertyResearchLimits {
  return {
    initialCandidates: Math.min(input?.initialCandidates ?? PROPERTY_RESEARCH_LIMITS.initialCandidates, PROPERTY_RESEARCH_LIMITS.initialCandidates),
    evaluatedCandidates: Math.min(input?.evaluatedCandidates ?? PROPERTY_RESEARCH_LIMITS.evaluatedCandidates, PROPERTY_RESEARCH_LIMITS.evaluatedCandidates),
    finalCandidates: Math.min(input?.finalCandidates ?? PROPERTY_RESEARCH_LIMITS.finalCandidates, PROPERTY_RESEARCH_LIMITS.finalCandidates),
  };
}

export { validatePropertyResearchBrief, validatePropertyCandidates } from "./validation.js";
