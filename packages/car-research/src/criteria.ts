import type {
  CarCandidate,
  CarCriterion,
  CriterionResult,
  CriterionStatus,
  DeliveryEvidence,
  OnRoadCost,
} from "./contracts.js";

export interface CriterionContext {
  onRoadCost: OnRoadCost;
  bodyStyle?: string;
  drivingAssistance: unknown;
  budgetEvidenceIds: string[];
  bodyStyleEvidenceIds: string[];
  configurationEvidenceIds: string[];
  delivery?: { evidence: readonly DeliveryEvidence[]; market: string; seriesId: string; trimId: string; now: string };
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

const capabilityAliases: Record<string, string[]> = {
  "highway-navigation": ["高快领航", "高速领航", "高速领航辅助", "高速导航辅助驾驶", "highwayNavigation", "navigation_assisted_driving_2"],
  "urban-navigation": ["城市领航", "城市领航辅助", "城区领航", "城市NOA", "urbanNavigation", "navigation_assisted_driving_1"],
  "adaptive-cruise": ["ACC", "自适应巡航", "全速自适应巡航", "adaptive_cruise", "full_speed_adaptive_cruise"],
  "lane-centering": ["车道居中", "车道居中保持", "lane_center"],
  "auto-parking": ["自动泊车", "自动泊车入位", "auto_park_entry"],
  "active-braking": ["AEB", "主动刹车", "自动紧急制动", "active_brake"],
};
const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/\s+/g, "");
function capabilityKey(value: unknown): string {
  const name = normalized(value);
  return Object.entries(capabilityAliases).find(([key, aliases]) =>
    normalized(key) === name || aliases.some((alias) => normalized(alias) === name))?.[0] ?? name;
}

function availabilityEntries(drivingAssistance: unknown): Array<Record<string, unknown>> {
  const root = object(drivingAssistance);
  const entries: Array<Record<string, unknown>> = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const record = object(value);
    if (!record) return;
    if (typeof record["availability"] === "string") {
      entries.push(record);
      visit(record["options"]);
    } else Object.values(record).forEach(visit);
  };
  visit(root?.["capabilities"]);
  visit(root?.["operatingDomains"]);
  return entries;
}

function capabilityEvaluator(criterion: CarCriterion, context: CriterionContext): CriterionResult {
  const wanted = stringList(criterion.requirement);
  if (!wanted.length) return result(criterion, "conflict", "capability requirement did not contain any names");
  const entries = availabilityEntries(context.drivingAssistance);
  const details = wanted.map((expected) => {
    const found = entries.filter((entry) => [entry["key"], entry["label"], entry["value"]]
      .some((value) => value != null && capabilityKey(value) === capabilityKey(expected)) ||
      (["highway-navigation", "urban-navigation"].includes(capabilityKey(expected)) &&
        entry["key"] === "navigation_assisted_driving" && entry["availability"] === "unavailable"));
    const present = found.some((entry) => entry["availability"] === "standard" ||
      (entry["availability"] === "value" && Boolean(entry["value"])));
    const absent = found.some((entry) => entry["availability"] === "unavailable");
    const optional = found.some((entry) => entry["availability"] === "optional");
    const status: CriterionStatus = present && absent ? "conflict" : present ? "pass" : absent && !optional ? "fail" : "unknown";
    return { key: expected, status, optional };
  });
  const status: CriterionStatus = details.some((item) => item.status === "conflict") ? "conflict"
    : details.some((item) => item.status === "fail") ? "fail"
    : details.some((item) => item.status === "unknown") ? "unknown" : "pass";
  return { ...result(criterion, status,
    details.map((item) => `${item.key}: ${item.status}${item.optional ? " (optional equipment; inclusion and cost unresolved)" : ""}`).join("; "),
    context.configurationEvidenceIds), details };
}

function deliveryEvaluator(criterion: CarCriterion, context: CriterionContext): CriterionResult {
  const target = object(criterion.requirement)?.["date"] ?? criterion.requirement;
  if (typeof target !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(target) ||
      !Number.isFinite(Date.parse(target)) || new Date(target).toISOString().slice(0, 10) !== target) {
    return result(criterion, "conflict", "delivery deadline must be a valid YYYY-MM-DD date (inclusive)");
  }
  const delivery = context.delivery;
  const assessed = delivery?.evidence.map((item) => ({ item, reasons: [
    ...(item.kind !== "commitment" ? ["estimate, not commitment"] : []),
    ...(item.market !== delivery.market ? ["different market"] : []),
    ...(item.trimId !== delivery.trimId ? ["different trim"] : []),
    ...(item.seriesId && item.seriesId !== delivery.seriesId ? ["different series"] : []),
    ...(!(Date.parse(item.retrievedAt) <= Date.parse(delivery.now) && Date.parse(item.validUntil) >= Date.parse(delivery.now)) ? ["not current"] : []),
  ] })) ?? [];
  const applicable = assessed.filter((entry) => !entry.reasons.length).map((entry) => entry.item);
  const ignored = assessed.filter((entry) => entry.reasons.length)
    .map((entry) => `${entry.item.id}: ${entry.reasons.join(", ")}`).join("; ");
  const suffix = ignored ? `; excluded evidence: ${ignored}` : "";
  const ids = assessed.map((entry) => entry.item.id);
  if (!applicable.length) return result(criterion, "unknown", `no current, documented delivery commitment for this exact trim and market; on-sale and presale status do not prove delivery${suffix}`, ids);
  const statuses = applicable.map((item) => item.latestDate <= target ? "pass" : item.earliestDate > target ? "fail" : "unknown");
  const status = new Set(statuses).size > 1 ? "conflict" : statuses[0]!;
  return result(criterion, status, `delivery by ${target}: ${applicable.map((item) => `${item.earliestDate}–${item.latestDate}`).join("; ")}${suffix}`, ids);
}

function claimedLevelNumber(value: unknown): number | undefined {
  const match = String(value ?? "").match(/L?\s*(\d+(?:\.\d+)?)/i);
  return match?.[1] ? Number(match[1]) : undefined;
}

const evaluators = new Map<string, CriterionEvaluator>([
  ["purchase.deliveryBefore", deliveryEvaluator],
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

function modelYearRank(value: string): number {
  const match = value.match(/(?:19|20)\d{2}/);
  return match ? Number(match[0]) : -1;
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
    // Explicit, unweighted coverage of the user's requested capabilities is a
    // tie-breaker within this preference, not a vehicle quality score.
    const passed = (item: CriterionResult | undefined) =>
      item?.details?.filter((detail) => detail.status === "pass").length ?? 0;
    const capabilityCoverage = passed(rightResult) - passed(leftResult);
    if (capabilityCoverage !== 0) return capabilityCoverage;
  }
  if (left.evidenceCompleteness !== right.evidenceCompleteness) {
    return right.evidenceCompleteness - left.evidenceCompleteness;
  }
  const leftScore = left.sourceRatings.autohome ?? left.sourceRatings.dongchedi ?? -1;
  const rightScore = right.sourceRatings.autohome ?? right.sourceRatings.dongchedi ?? -1;
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  // When all recorded criteria and evidence are tied, prefer the newest
  // on-sale model year so an older clearance trim cannot displace a current
  // facelift merely because its source identifier sorts first.
  const modelYear = modelYearRank(right.trim.year) - modelYearRank(left.trim.year);
  if (modelYear !== 0) {
    return modelYear;
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
