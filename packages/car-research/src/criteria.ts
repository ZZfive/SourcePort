import type {
  CarCandidate,
  CarCriterion,
  CriterionResult,
  CriterionStatus,
  OnRoadCost,
} from "./contracts.js";

export interface CriterionContext {
  onRoadCost: OnRoadCost;
  bodyStyle?: string;
  drivingAssistance: unknown;
  budgetEvidenceIds: string[];
  bodyStyleEvidenceIds: string[];
  configurationEvidenceIds: string[];
}

type CriterionEvaluator = (criterion: CarCriterion, context: CriterionContext) => CriterionResult;

function result(
  criterion: CarCriterion,
  status: CriterionStatus,
  message: string,
  evidenceIds: string[] = [],
): CriterionResult {
  return { criterion, status, message, evidenceIds: [...new Set(evidenceIds)] };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  const record = object(value);
  return stringList(record?.["values"] ?? record?.["preferred"] ?? record?.["required"]);
}

function maximumBudget(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const record = object(value);
  const maximum = Number(record?.["maxCny"] ?? record?.["maximumCny"]);
  return Number.isFinite(maximum) ? maximum : undefined;
}

function availabilityEntries(drivingAssistance: unknown): Array<Record<string, unknown>> {
  const root = object(drivingAssistance);
  const capabilities = object(root?.["capabilities"]);
  if (!capabilities) {
    return [];
  }
  return Object.values(capabilities).flatMap((group) =>
    Array.isArray(group)
      ? group.filter((item): item is Record<string, unknown> => object(item) !== undefined)
      : []);
}

function capabilityEvaluator(criterion: CarCriterion, context: CriterionContext): CriterionResult {
  const wanted = stringList(criterion.requirement);
  if (wanted.length === 0) {
    return result(criterion, "conflict", "capability requirement did not contain any names");
  }
  const entries = availabilityEntries(context.drivingAssistance);
  if (entries.length === 0) {
    return result(
      criterion,
      "unknown",
      "exact-trim driving-assistance capability evidence is unavailable",
      context.configurationEvidenceIds,
    );
  }
  const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").toLowerCase();
  const missing: string[] = [];
  const optional: string[] = [];
  for (const expected of wanted) {
    const found = entries.find((entry) => {
      const haystack = `${normalized(entry["key"])} ${normalized(entry["label"])} ${normalized(entry["value"])}`;
      return haystack.includes(normalized(expected));
    });
    if (!found || found["availability"] === "unknown") {
      missing.push(expected);
    } else if (found["availability"] === "unavailable") {
      return result(
        criterion,
        "fail",
        `exact trim marks '${expected}' unavailable`,
        context.configurationEvidenceIds,
      );
    } else if (found["availability"] === "optional") {
      optional.push(expected);
    }
  }
  if (missing.length > 0) {
    return result(
      criterion,
      "unknown",
      `capability evidence did not resolve: ${missing.join(", ")}`,
      context.configurationEvidenceIds,
    );
  }
  return result(
    criterion,
    "pass",
    optional.length > 0
      ? `capabilities are available but optional: ${optional.join(", ")}`
      : "all requested capabilities are present on the exact trim",
    context.configurationEvidenceIds,
  );
}

function claimedLevelNumber(value: unknown): number | undefined {
  const match = String(value ?? "").match(/L?\s*(\d+(?:\.\d+)?)/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

const evaluators = new Map<string, CriterionEvaluator>([
  ["budget.onRoad.maxCny", (criterion, context) => {
    const maximum = maximumBudget(criterion.requirement);
    if (maximum === undefined) {
      return result(criterion, "conflict", "budget requirement did not include a numeric maximum");
    }
    if (context.onRoadCost.status !== "known" || !context.onRoadCost.range) {
      return result(
        criterion,
        "unknown",
        context.onRoadCost.reasons.join("; ") || "on-road cost is unknown",
        context.budgetEvidenceIds,
      );
    }
    if (context.onRoadCost.range.minimumCny > maximum) {
      return result(
        criterion,
        "fail",
        `minimum evidenced on-road cost ${context.onRoadCost.range.minimumCny} exceeds ${maximum}`,
        context.budgetEvidenceIds,
      );
    }
    if (context.onRoadCost.range.maximumCny <= maximum) {
      return result(
        criterion,
        "pass",
        `maximum evidenced on-road cost ${context.onRoadCost.range.maximumCny} is within ${maximum}`,
        context.budgetEvidenceIds,
      );
    }
    return result(
      criterion,
      "conflict",
      `evidenced on-road range crosses the budget threshold ${maximum}`,
      context.budgetEvidenceIds,
    );
  }],
  ["bodyStyle.preferred", (criterion, context) => {
    const preferred = stringList(criterion.requirement);
    if (preferred.length === 0) {
      return result(criterion, "conflict", "body-style preference is empty");
    }
    if (!context.bodyStyle) {
      return result(
        criterion,
        "unknown",
        "cross-source body-style evidence is unavailable",
        context.bodyStyleEvidenceIds,
      );
    }
    const style = context.bodyStyle.toLowerCase();
    const matched = preferred.some((value) => style.includes(value.toLowerCase()));
    return result(
      criterion,
      matched ? "pass" : "fail",
      matched
        ? `source level '${context.bodyStyle}' matches the preference`
        : `source level '${context.bodyStyle}' does not match ${preferred.join(", ")}`,
      context.bodyStyleEvidenceIds,
    );
  }],
  ["drivingAssistance.capabilities", capabilityEvaluator],
  ["drivingAssistance.claimedLevel.min", (criterion, context) => {
    const required = claimedLevelNumber(
      object(criterion.requirement)?.["level"] ?? criterion.requirement,
    );
    const root = object(context.drivingAssistance);
    const claimed = object(root?.["claimedAutomationLevel"]);
    const actual = claimedLevelNumber(claimed?.["value"]);
    if (required === undefined) {
      return result(criterion, "conflict", "claimed-level requirement is invalid");
    }
    if (actual === undefined) {
      return result(
        criterion,
        "unknown",
        "the exact trim has no claimed automation level",
        context.configurationEvidenceIds,
      );
    }
    return result(
      criterion,
      actual >= required ? "pass" : "fail",
      `claimed level L${actual} ${actual >= required ? "meets" : "does not meet"} L${required}`,
      context.configurationEvidenceIds,
    );
  }],
  ["ownership.privateCharger", (criterion) => result(
    criterion,
    "unknown",
    "private-charger availability is usage context and does not automatically exclude a powertrain",
  )],
]);

export function isSupportedCriterion(key: string): boolean {
  return evaluators.has(key);
}

export function evaluateCriteria(
  criteria: readonly CarCriterion[],
  context: CriterionContext,
): CriterionResult[] {
  return criteria.map((criterion) => {
    const evaluator = evaluators.get(criterion.key);
    return evaluator
      ? evaluator(criterion, context)
      : result(criterion, "unsupported", `criterion '${criterion.key}' is not supported`);
  });
}

export function candidateEligibility(results: readonly CriterionResult[]): CarCandidate["eligibility"] {
  if (results.some((item) => item.criterion.kind === "hard" && item.status === "fail")) {
    return "rejected";
  }
  if (results.some((item) =>
    item.criterion.kind === "hard" &&
    (item.status === "unknown" || item.status === "conflict" || item.status === "unsupported"))) {
    return "needs-verification";
  }
  return "eligible";
}

function preferenceRank(status: CriterionStatus): number {
  switch (status) {
    case "pass": return 0;
    case "unknown": return 1;
    case "conflict": return 2;
    case "unsupported": return 3;
    case "fail": return 4;
  }
}

function eligibilityRank(value: CarCandidate["eligibility"]): number {
  return value === "eligible" ? 0 : value === "needs-verification" ? 1 : 2;
}

export function compareCandidates(left: CarCandidate, right: CarCandidate): number {
  const eligibility = eligibilityRank(left.eligibility) - eligibilityRank(right.eligibility);
  if (eligibility !== 0) {
    return eligibility;
  }
  const preferenceKeys = [...new Set([
    ...left.criterionResults,
    ...right.criterionResults,
  ].filter((item) => item.criterion.kind === "preference")
    .sort((a, b) => b.criterion.priority - a.criterion.priority)
    .map((item) => item.criterion.key))];
  for (const key of preferenceKeys) {
    const leftResult = left.criterionResults.find((item) => item.criterion.key === key);
    const rightResult = right.criterionResults.find((item) => item.criterion.key === key);
    const difference = preferenceRank(leftResult?.status ?? "unknown") -
      preferenceRank(rightResult?.status ?? "unknown");
    if (difference !== 0) {
      return difference;
    }
  }
  if (left.evidenceCompleteness !== right.evidenceCompleteness) {
    return right.evidenceCompleteness - left.evidenceCompleteness;
  }
  const leftScore = left.sourceRatings.autohome ?? left.sourceRatings.dongchedi ?? -1;
  const rightScore = right.sourceRatings.autohome ?? right.sourceRatings.dongchedi ?? -1;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return left.candidateId.localeCompare(right.candidateId);
}

export function evidenceCompleteness(results: readonly CriterionResult[]): number {
  if (results.length === 0) {
    return 0;
  }
  const resolved = results.filter((item) =>
    item.status === "pass" || item.status === "fail").length;
  return Number((resolved / results.length).toFixed(3));
}
