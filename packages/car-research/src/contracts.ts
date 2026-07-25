import type {
  EvidenceRecord,
  RecoveryAction,
  SourceRequest,
  SourceResult,
  SourceWarning,
} from "@sourceport/core";

export const MAX_RESEARCH_LIMITS = {
  initialSeeds: 8,
  expandedSeries: 12,
  scannedSeries: 8,
  exactConfigurations: 6,
  finalCandidates: 5,
  ownerReviewsPerSeries: 5,
} as const;

export interface CarCriterion {
  key: string;
  label: string;
  kind: "hard" | "preference" | "context";
  priority: number;
  requirement: unknown;
}

export type CandidateSeed =
  | {
      kind: "series";
      name: string;
      brand?: string;
      sourceHint?: "dongchedi" | "autohome";
      sourceId?: string;
    }
  | {
      kind: "brand";
      brand: string;
    };

export type CostComponent =
  | "vehicle-price"
  | "purchase-tax"
  | "insurance"
  | "registration"
  | "other";

export interface CostEvidence {
  id: string;
  component: CostComponent;
  minimumCny: number;
  maximumCny: number;
  mandatory: boolean;
  source: string;
  sourceUrl?: string;
  retrievedAt: string;
  market?: string;
  applicability: string;
  appliesTo?: {
    seriesId?: string;
    trimId?: string;
  };
}

export interface ResearchLimits {
  initialSeeds: number;
  expandedSeries: number;
  scannedSeries: number;
  exactConfigurations: number;
  finalCandidates: number;
  ownerReviewsPerSeries: number;
}

export interface CarResearchBrief {
  query: string;
  market: {
    country?: string;
    city: string;
    currency?: "CNY";
  };
  criteria: CarCriterion[];
  seeds: CandidateSeed[];
  costEvidence?: CostEvidence[];
  limits?: Partial<ResearchLimits>;
  freshness?: SourceRequest["freshness"];
  execution?: SourceRequest["execution"];
}

export type CriterionStatus = "pass" | "fail" | "unknown" | "conflict" | "unsupported";

export interface CriterionResult {
  criterion: CarCriterion;
  status: CriterionStatus;
  message: string;
  evidenceIds: string[];
}

export interface MoneyRange {
  minimumCny: number;
  maximumCny: number;
}

export interface OnRoadCostComponent {
  component: CostComponent | "vehicle-reference";
  range: MoneyRange;
  source: string;
  applicability: string;
  evidenceIds: string[];
}

export interface OnRoadCost {
  status: "known" | "unknown";
  range?: MoneyRange;
  estimateRange?: MoneyRange;
  components: OnRoadCostComponent[];
  missingComponents: CostComponent[];
  reasons: string[];
  evidenceIds: string[];
}

export interface CrossSourceMatch {
  status: "matched" | "unmatched" | "conflict";
  message: string;
  dongchediSeriesId?: string;
  autohomeSeriesId?: string;
  evidenceIds: string[];
}

export interface CarCandidate {
  candidateId: string;
  eligibility: "eligible" | "needs-verification" | "rejected";
  series: {
    name: string;
    brand: string;
    dongchediSeriesId?: string;
    autohomeSeriesId?: string;
    bodyStyle?: string;
    guidePrice?: string;
    officialPrice?: string;
    dealerPrice?: string;
    sourceUrls: string[];
  };
  trim: {
    trimId: string;
    name: string;
    year: string;
    officialPrice: string;
    dealerPrice: string;
    ownerPrice: string;
    sourceUrl: string;
    configurationUrl: string;
  };
  crossSource: CrossSourceMatch;
  seriesOverview?: unknown;
  ownerReviews: unknown[];
  configuration: unknown[];
  drivingAssistance: unknown;
  onRoadCost: OnRoadCost;
  criterionResults: CriterionResult[];
  sourceRatings: {
    dongchedi?: number | null;
    autohome?: number | null;
  };
  evidenceCompleteness: number;
  evidenceIds: string[];
}

export interface CoverageReport {
  mode: "bounded";
  limits: ResearchLimits;
  attemptedSeeds: number;
  validatedSeeds: number;
  expandedSeries: number;
  scannedSeries: number;
  configuredTrims: number;
  limitations: string[];
}

export interface CarResearchFailure {
  code: "invalid_brief" | "no_validated_candidates" | "research_execution_failed";
  message: string;
  issues?: Array<{ path: string; message: string }>;
}

export interface CarResearchReport {
  status: "success" | "partial" | "blocked" | "failed";
  query: string;
  market: CarResearchBrief["market"];
  generatedAt: string;
  coverage: CoverageReport;
  candidates: CarCandidate[];
  rejected: CarCandidate[];
  unsupportedCriteria: CarCriterion[];
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
  evidence: EvidenceRecord[];
  failure?: CarResearchFailure;
}

export type SourceExecutor = (request: SourceRequest) => Promise<SourceResult>;

export interface CarResearchDependencies {
  execute: SourceExecutor;
  now?: () => Date;
}

export interface BriefValidationResult {
  ok: boolean;
  value?: CarResearchBrief;
  issues: Array<{ path: string; message: string }>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

export function resolvedLimits(input: Partial<ResearchLimits> | undefined): ResearchLimits {
  return {
    initialSeeds: input?.initialSeeds ?? MAX_RESEARCH_LIMITS.initialSeeds,
    expandedSeries: input?.expandedSeries ?? MAX_RESEARCH_LIMITS.expandedSeries,
    scannedSeries: input?.scannedSeries ?? MAX_RESEARCH_LIMITS.scannedSeries,
    exactConfigurations: input?.exactConfigurations ?? MAX_RESEARCH_LIMITS.exactConfigurations,
    finalCandidates: input?.finalCandidates ?? MAX_RESEARCH_LIMITS.finalCandidates,
    ownerReviewsPerSeries:
      input?.ownerReviewsPerSeries ?? MAX_RESEARCH_LIMITS.ownerReviewsPerSeries,
  };
}

export function validateCarResearchBrief(input: unknown): BriefValidationResult {
  const issues: BriefValidationResult["issues"] = [];
  if (!isObject(input)) {
    return { ok: false, issues: [{ path: "", message: "brief must be an object" }] };
  }
  if (typeof input["query"] !== "string" || !input["query"].trim()) {
    issues.push({ path: "query", message: "query must be a non-empty string" });
  }
  const market = input["market"];
  if (!isObject(market) || typeof market["city"] !== "string" || !market["city"].trim()) {
    issues.push({ path: "market.city", message: "market.city must be a non-empty string" });
  }
  const criteria = input["criteria"];
  if (!Array.isArray(criteria)) {
    issues.push({ path: "criteria", message: "criteria must be an array" });
  } else {
    criteria.forEach((criterion, index) => {
      if (!isObject(criterion)) {
        issues.push({ path: `criteria.${index}`, message: "criterion must be an object" });
        return;
      }
      if (typeof criterion["key"] !== "string" || !criterion["key"].trim()) {
        issues.push({ path: `criteria.${index}.key`, message: "key must be non-empty" });
      }
      if (typeof criterion["label"] !== "string" || !criterion["label"].trim()) {
        issues.push({ path: `criteria.${index}.label`, message: "label must be non-empty" });
      }
      if (!["hard", "preference", "context"].includes(String(criterion["kind"]))) {
        issues.push({ path: `criteria.${index}.kind`, message: "kind is invalid" });
      }
      if (!Number.isInteger(criterion["priority"]) || Number(criterion["priority"]) < 0) {
        issues.push({ path: `criteria.${index}.priority`, message: "priority must be a non-negative integer" });
      }
      if (!("requirement" in criterion)) {
        issues.push({ path: `criteria.${index}.requirement`, message: "requirement is required" });
      }
    });
  }
  const seeds = input["seeds"];
  if (!Array.isArray(seeds) || seeds.length === 0) {
    issues.push({ path: "seeds", message: "seeds must contain at least one item" });
  } else {
    if (seeds.length > MAX_RESEARCH_LIMITS.initialSeeds) {
      issues.push({ path: "seeds", message: `seeds cannot exceed ${MAX_RESEARCH_LIMITS.initialSeeds}` });
    }
    seeds.forEach((seed, index) => {
      if (!isObject(seed) || (seed["kind"] !== "series" && seed["kind"] !== "brand")) {
        issues.push({ path: `seeds.${index}`, message: "seed kind must be series or brand" });
        return;
      }
      const key = seed["kind"] === "series" ? "name" : "brand";
      if (typeof seed[key] !== "string" || !String(seed[key]).trim()) {
        issues.push({ path: `seeds.${index}.${key}`, message: `${key} must be non-empty` });
      }
    });
  }
  if (input["limits"] !== undefined) {
    if (!isObject(input["limits"])) {
      issues.push({ path: "limits", message: "limits must be an object" });
    } else {
      const limits = input["limits"];
      for (const [key, maximum] of Object.entries(MAX_RESEARCH_LIMITS)) {
        const value = limits[key];
        if (value !== undefined && (!positiveInteger(value) || Number(value) > maximum)) {
          issues.push({ path: `limits.${key}`, message: `${key} must be between 1 and ${maximum}` });
        }
      }
    }
  }
  if (input["costEvidence"] !== undefined) {
    if (!Array.isArray(input["costEvidence"])) {
      issues.push({ path: "costEvidence", message: "costEvidence must be an array" });
    } else {
      const ids = new Set<string>();
      input["costEvidence"].forEach((evidence, index) => {
        if (!isObject(evidence)) {
          issues.push({ path: `costEvidence.${index}`, message: "cost evidence must be an object" });
          return;
        }
        const minimum = Number(evidence["minimumCny"]);
        const maximum = Number(evidence["maximumCny"]);
        if (!Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < minimum) {
          issues.push({ path: `costEvidence.${index}`, message: "cost range is invalid" });
        }
        if (typeof evidence["id"] !== "string" || !evidence["id"].trim()) {
          issues.push({ path: `costEvidence.${index}.id`, message: "id must be non-empty" });
        } else if (ids.has(evidence["id"])) {
          issues.push({ path: `costEvidence.${index}.id`, message: "cost evidence IDs must be unique" });
        } else {
          ids.add(evidence["id"]);
        }
        if (!["vehicle-price", "purchase-tax", "insurance", "registration", "other"].includes(String(evidence["component"]))) {
          issues.push({ path: `costEvidence.${index}.component`, message: "component is invalid" });
        }
        if (typeof evidence["mandatory"] !== "boolean") {
          issues.push({ path: `costEvidence.${index}.mandatory`, message: "mandatory must be boolean" });
        }
        if (typeof evidence["source"] !== "string" || !evidence["source"].trim()) {
          issues.push({ path: `costEvidence.${index}.source`, message: "source must be non-empty" });
        }
        if (typeof evidence["applicability"] !== "string" || !evidence["applicability"].trim()) {
          issues.push({ path: `costEvidence.${index}.applicability`, message: "applicability must be non-empty" });
        }
        if (typeof evidence["retrievedAt"] !== "string" || Number.isNaN(Date.parse(evidence["retrievedAt"]))) {
          issues.push({ path: `costEvidence.${index}.retrievedAt`, message: "retrievedAt must be an ISO date" });
        }
      });
    }
  }
  if (input["freshness"] !== undefined) {
    const freshness = input["freshness"];
    if (!isObject(freshness) || !["live", "prefer-live", "allow-stale"].includes(String(freshness["mode"]))) {
      issues.push({ path: "freshness", message: "freshness mode is invalid" });
    } else {
      const maxAge = freshness["maxAgeMs"];
      if (freshness["mode"] === "live" && maxAge !== undefined) {
        issues.push({ path: "freshness.maxAgeMs", message: "live freshness cannot include maxAgeMs" });
      }
      if (freshness["mode"] !== "live" && (!positiveInteger(maxAge))) {
        issues.push({ path: "freshness.maxAgeMs", message: "cache freshness requires a positive maxAgeMs" });
      }
    }
  }
  return issues.length === 0
    ? { ok: true, value: input as unknown as CarResearchBrief, issues: [] }
    : { ok: false, issues };
}
