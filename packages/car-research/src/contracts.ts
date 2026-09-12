import type {
  EvidenceRecord,
  RecoveryAction,
  SourceExecutor as CoreSourceExecutor,
  SourceRequest,
  SourceWarning,
} from "@sourceport/core";

export const MAX_RESEARCH_LIMITS = {
  initialSeeds: 64,
  expandedSeries: 256,
  scannedSeries: 64,
  exactConfigurations: 256,
  finalCandidates: 5,
  ownerReviewsPerSeries: 5,
} as const;

export const DEFAULT_RESEARCH_LIMITS: ResearchLimits = {
  initialSeeds: 8, expandedSeries: 24, scannedSeries: 8,
  exactConfigurations: 16, finalCandidates: 5, ownerReviewsPerSeries: 3,
};

/** A discovery lead is not evidence of price, equipment or availability. */
export interface CarDiscoveryLead {
  name: string;
  brand: string;
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  marketStatus?: "on-sale" | "presale" | "announced" | "unknown";
}

/** A dated commitment for the exact trim and market, supplied with its document. */
export interface DeliveryEvidence {
  id: string;
  source: string;
  sourceUrl: string;
  retrievedAt: string;
  validUntil: string;
  market: string;
  trimId: string;
  seriesId?: string;
  kind: "commitment" | "estimate";
  earliestDate: string;
  latestDate: string;
}

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
  purchaseTiming?: { targetDate?: string; urgency?: "now" | "soon" | "exploring" };
  budget?: { minimumCny?: number; maximumCny?: number; basis?: "guide" | "reference" | "deal" | "on-road" };
  usageContext?: { commuteKmPerDay?: number; longDistanceFrequency?: "rare" | "monthly" | "weekly"; familyMembers?: number; charging?: "home" | "public" | "none" | "unknown" };
  criteria: CarCriterion[];
  seeds: CandidateSeed[];
  discovery?: { brands?: string[]; leads?: CarDiscoveryLead[] };
  costEvidence?: CostEvidence[];
  deliveryEvidence?: DeliveryEvidence[];
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
  details?: Array<{ key: string; status: CriterionStatus; optional?: boolean }>;
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
  alternatives?: Array<{
    trimId: string;
    name: string;
    year: string;
    price: string;
    selectionStatus: "not-selected";
    reason: string;
    configurationStatus?: "acquired" | "failed" | "not-inspected";
    criterionResults?: CriterionResult[];
    evidenceIds?: string[];
  }>;
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
  configurationStatus?: "acquired" | "failed" | "not-inspected";
}

export interface DiscoveredCarSeries {
  name: string;
  brand: string;
  dongchediSeriesId?: string;
  autohomeSeriesId?: string;
  origins: Array<"seed" | "lead" | "catalog" | "competitor">;
  status: "unresolved" | "not-scanned" | "no-trims" | "scanned";
  reason: string;
  sourceUrls: string[];
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
  configurationAttempts?: number;
  discoveredSeries?: number;
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
  decisionContext?: Pick<CarResearchBrief, "purchaseTiming" | "budget" | "usageContext">;
  generatedAt: string;
  coverage: CoverageReport;
  candidates: CarCandidate[];
  rejected: CarCandidate[];
  /** One selected representative per scanned series, before the presentation cap. */
  allCandidates?: CarCandidate[];
  /** Every inspected or uninspected trim returned by list-trims, with reasons. */
  evaluatedTrims?: CarCandidate[];
  discoveredSeries?: DiscoveredCarSeries[];
  unsupportedCriteria: CarCriterion[];
  warnings: SourceWarning[];
  recoveryActions: RecoveryAction[];
  evidence: EvidenceRecord[];
  /** Optional enrichment supplied by market-intelligence/market-feedback. */
  dataAsOf?: string;
  freshness?: "fresh" | "aging" | "stale" | "unverified";
  marketChanges?: Array<{ seriesId: string; kind: string; summary: string; evidenceIds: string[] }>;
  feedbackClusters?: Array<{ series: string; topic: string; signal: string; rationale: string; modelYears?: string[]; trimIds?: string[]; firstSeenAt?: string; lastSeenAt?: string; sourceCount?: number; evidenceIds: string[] }>;
  actionItems?: string[];
  recommendation?: { status: "recommend" | "verify-before-buy" | "pause"; rationale: string; evidenceIds: string[] };
  failure?: CarResearchFailure;
}

export type SourceExecutor = CoreSourceExecutor;

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

function dateOnly(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}

function sourceUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

/** Convenience fields become explicit hard criteria, rather than unused metadata. */
export function effectiveCriteria(brief: CarResearchBrief): CarCriterion[] {
  const criteria = [...brief.criteria];
  if (brief.purchaseTiming?.targetDate && !criteria.some((item) => item.key === "purchase.deliveryBefore")) {
    criteria.push({ key: "purchase.deliveryBefore", label: "Delivery deadline", kind: "hard", priority: 100,
      requirement: { date: brief.purchaseTiming.targetDate } });
  }
  if (brief.budget?.basis === "on-road" && brief.budget.maximumCny !== undefined && !criteria.some((item) => item.key === "budget.onRoad.maxCny")) {
    criteria.push({ key: "budget.onRoad.maxCny", label: "On-road budget ceiling", kind: "hard", priority: 100,
      requirement: { maxCny: brief.budget.maximumCny } });
  }
  return criteria;
}

export function resolvedLimits(input: Partial<ResearchLimits> | undefined): ResearchLimits {
  return {
    initialSeeds: input?.initialSeeds ?? DEFAULT_RESEARCH_LIMITS.initialSeeds,
    expandedSeries: input?.expandedSeries ?? DEFAULT_RESEARCH_LIMITS.expandedSeries,
    scannedSeries: input?.scannedSeries ?? DEFAULT_RESEARCH_LIMITS.scannedSeries,
    exactConfigurations: input?.exactConfigurations ?? DEFAULT_RESEARCH_LIMITS.exactConfigurations,
    finalCandidates: input?.finalCandidates ?? DEFAULT_RESEARCH_LIMITS.finalCandidates,
    ownerReviewsPerSeries:
      input?.ownerReviewsPerSeries ?? DEFAULT_RESEARCH_LIMITS.ownerReviewsPerSeries,
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
  const budget = input["budget"];
  if (budget !== undefined) {
    if (!isObject(budget)) issues.push({ path: "budget", message: "budget must be an object" });
    else {
      const min = budget["minimumCny"]; const max = budget["maximumCny"];
      if (min !== undefined && (typeof min !== "number" || !Number.isFinite(min) || min < 0)) issues.push({ path: "budget.minimumCny", message: "minimumCny must be a non-negative number" });
      if (max !== undefined && (typeof max !== "number" || !Number.isFinite(max) || max < 0 || (min !== undefined && max < Number(min)))) issues.push({ path: "budget.maximumCny", message: "maximumCny must be a number >= minimumCny" });
      if (budget["basis"] !== undefined && !["guide", "reference", "deal", "on-road"].includes(String(budget["basis"]))) issues.push({ path: "budget.basis", message: "basis is invalid" });
    }
  }
  const timing = input["purchaseTiming"];
  if (timing !== undefined && (!isObject(timing) ||
    (timing["targetDate"] !== undefined && !dateOnly(timing["targetDate"])))) {
    issues.push({ path: "purchaseTiming.targetDate", message: "targetDate must be a valid YYYY-MM-DD date" });
  }
  const discovery = input["discovery"];
  if (discovery !== undefined) {
    if (!isObject(discovery)) issues.push({ path: "discovery", message: "discovery must be an object" });
    else {
      if (discovery["brands"] !== undefined && (!Array.isArray(discovery["brands"]) || discovery["brands"].length > 64 ||
        discovery["brands"].some((brand) => typeof brand !== "string" || !brand.trim()))) {
        issues.push({ path: "discovery.brands", message: "brands must contain at most 64 non-empty strings" });
      }
      const leads = discovery["leads"];
      if (leads !== undefined) {
        if (!Array.isArray(leads) || leads.length > 64) issues.push({ path: "discovery.leads", message: "leads must be an array of at most 64 items" });
        else leads.forEach((lead, index) => {
          if (!isObject(lead) || ["name", "brand", "source"].some((key) => typeof lead[key] !== "string" || !String(lead[key]).trim()) ||
            !sourceUrl(lead["sourceUrl"]) || typeof lead["retrievedAt"] !== "string" || !Number.isFinite(Date.parse(lead["retrievedAt"]))) {
            issues.push({ path: `discovery.leads.${index}`, message: "a lead needs name, brand, source, URL and retrieval time" });
          } else if (lead["marketStatus"] !== undefined && !["on-sale", "presale", "announced", "unknown"].includes(String(lead["marketStatus"]))) {
            issues.push({ path: `discovery.leads.${index}.marketStatus`, message: "invalid market status" });
          }
        });
      }
    }
  }
  const deliveryEvidence = input["deliveryEvidence"];
  if (deliveryEvidence !== undefined) {
    if (!Array.isArray(deliveryEvidence)) issues.push({ path: "deliveryEvidence", message: "deliveryEvidence must be an array" });
    else {
      const ids = new Set<string>();
      deliveryEvidence.forEach((item, index) => {
        if (!isObject(item)) { issues.push({ path: `deliveryEvidence.${index}`, message: "expected delivery evidence object" }); return; }
        const valid = ["id", "source", "market", "trimId"].every((key) => typeof item[key] === "string" && String(item[key]).trim()) &&
          sourceUrl(item["sourceUrl"]) && ["commitment", "estimate"].includes(String(item["kind"])) &&
          typeof item["retrievedAt"] === "string" && Number.isFinite(Date.parse(item["retrievedAt"])) &&
          typeof item["validUntil"] === "string" && Number.isFinite(Date.parse(item["validUntil"])) &&
          Date.parse(String(item["validUntil"])) >= Date.parse(String(item["retrievedAt"])) &&
          dateOnly(item["earliestDate"]) && dateOnly(item["latestDate"]) && item["earliestDate"] <= item["latestDate"] &&
          (item["seriesId"] === undefined || typeof item["seriesId"] === "string");
        if (!valid || ids.has(String(item["id"]))) issues.push({ path: `deliveryEvidence.${index}`, message: "invalid or duplicate dated, scoped delivery evidence" });
        ids.add(String(item["id"]));
      });
    }
  }
  const usage = input["usageContext"];
  if (usage !== undefined && !isObject(usage)) issues.push({ path: "usageContext", message: "usageContext must be an object" });
  if (isObject(usage) && usage["commuteKmPerDay"] !== undefined && (!Number.isFinite(Number(usage["commuteKmPerDay"])) || Number(usage["commuteKmPerDay"]) < 0)) issues.push({ path: "usageContext.commuteKmPerDay", message: "commuteKmPerDay must be non-negative" });
  const criteria = input["criteria"];
  if (!Array.isArray(criteria)) {
    issues.push({ path: "criteria", message: "criteria must be an array" });
  } else {
    const criterionKeys = new Set<string>();
    criteria.forEach((criterion, index) => {
      if (!isObject(criterion)) {
        issues.push({ path: `criteria.${index}`, message: "criterion must be an object" });
        return;
      }
      if (typeof criterion["key"] !== "string" || !criterion["key"].trim()) {
        issues.push({ path: `criteria.${index}.key`, message: "key must be non-empty" });
      } else if (criterionKeys.has(criterion["key"])) {
        issues.push({ path: `criteria.${index}.key`, message: "criterion keys must be unique; put capabilities in one requirement list" });
      } else {
        criterionKeys.add(criterion["key"]);
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
      if (criterion["key"] === "purchase.deliveryBefore" && isObject(timing) && timing["targetDate"] !== undefined) {
        const requirement = criterion["requirement"];
        const date = isObject(requirement) ? requirement["date"] : requirement;
        if (date !== timing["targetDate"] || criterion["kind"] !== "hard") {
          issues.push({ path: `criteria.${index}`, message: "delivery criterion must agree with purchaseTiming.targetDate as a hard condition" });
        }
      }
      if (criterion["key"] === "budget.onRoad.maxCny" && isObject(budget) && budget["basis"] === "on-road" && budget["maximumCny"] !== undefined) {
        const requirement = criterion["requirement"];
        const maximum = isObject(requirement) ? requirement["maxCny"] ?? requirement["maximumCny"] : requirement;
        if (maximum !== budget["maximumCny"] || criterion["kind"] !== "hard") {
          issues.push({ path: `criteria.${index}`, message: "on-road criterion must agree with budget.maximumCny as a hard condition" });
        }
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
      const ids = new Set<string>(Array.isArray(deliveryEvidence)
        ? deliveryEvidence.filter(isObject).map((item) => String(item["id"])) : []);
      input["costEvidence"].forEach((evidence, index) => {
        if (!isObject(evidence)) {
          issues.push({ path: `costEvidence.${index}`, message: "cost evidence must be an object" });
          return;
        }
        const minimum = Number(evidence["minimumCny"]);
        const maximum = Number(evidence["maximumCny"]);
        if (typeof evidence["minimumCny"] !== "number" || typeof evidence["maximumCny"] !== "number" ||
          !Number.isFinite(minimum) || minimum < 0 || !Number.isFinite(maximum) || maximum < minimum) {
          issues.push({ path: `costEvidence.${index}`, message: "cost range is invalid" });
        }
        if (typeof evidence["id"] !== "string" || !evidence["id"].trim()) {
          issues.push({ path: `costEvidence.${index}.id`, message: "id must be non-empty" });
        } else if (ids.has(evidence["id"])) {
          issues.push({ path: `costEvidence.${index}.id`, message: "cost and delivery evidence IDs must be unique" });
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
        if (evidence["sourceUrl"] !== undefined && !sourceUrl(evidence["sourceUrl"])) {
          issues.push({ path: `costEvidence.${index}.sourceUrl`, message: "sourceUrl must be an HTTP(S) URL" });
        }
        if (evidence["market"] !== undefined && (typeof evidence["market"] !== "string" || !evidence["market"].trim())) {
          issues.push({ path: `costEvidence.${index}.market`, message: "market must be non-empty" });
        }
        const scope = evidence["appliesTo"];
        if (scope !== undefined && (!isObject(scope) || ["seriesId", "trimId"].some((key) =>
          scope[key] !== undefined && (typeof scope[key] !== "string" || !scope[key].trim())))) {
          issues.push({ path: `costEvidence.${index}.appliesTo`, message: "scope IDs must be non-empty strings" });
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
