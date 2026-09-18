import type { PropertyCandidateInput, PropertyCriterion, PropertyCostResult, CriterionResult, CriterionStatus } from "./contracts.js";

function result(criterion: PropertyCriterion, status: CriterionStatus, message: string, evidenceIds: string[] = []): CriterionResult {
  return { criterion, status, message, evidenceIds: [...new Set(evidenceIds)] };
}

function numberRequirement(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const number = Number(record["max"] ?? record["maximum"] ?? record["minutes"]);
    return Number.isFinite(number) ? number : undefined;
  }
  return undefined;
}

function evaluateCriterion(criterion: PropertyCriterion, candidate: PropertyCandidateInput, cost: PropertyCostResult): CriterionResult {
  if (criterion.key === "budget.allIn.maxCny") {
    const maximum = numberRequirement(criterion.requirement);
    if (maximum === undefined) return result(criterion, "conflict", "all-in budget requirement must include a numeric maximum");
    if (cost.range && cost.range.minimumCny > maximum) return result(criterion, "fail", `known all-in minimum ${cost.range.minimumCny} exceeds ${maximum}`, cost.evidenceIds);
    if (cost.estimateRange && cost.estimateRange.minimumCny > maximum) return result(criterion, "fail", `estimated all-in minimum ${cost.estimateRange.minimumCny} exceeds ${maximum}`, cost.evidenceIds);
    if (cost.status !== "known") return result(criterion, "unknown", cost.reasons.join("; ") || "all-in cost is not fully evidenced", cost.evidenceIds);
    return result(criterion, cost.range!.maximumCny <= maximum ? "pass" : "fail", `known all-in range ${cost.range!.minimumCny}–${cost.range!.maximumCny}`, cost.evidenceIds);
  }
  if (criterion.key === "layout.bedrooms") {
    const wanted = numberRequirement(criterion.requirement);
    if (wanted === undefined) return result(criterion, "conflict", "bedroom requirement must be numeric");
    if (candidate.bedrooms === undefined) return result(criterion, "unknown", "bedroom count is missing");
    return result(criterion, candidate.bedrooms >= wanted ? "pass" : "fail", `${candidate.bedrooms} bedrooms; requested at least ${wanted}`);
  }
  if (criterion.key === "layout.livingRooms") {
    const wanted = numberRequirement(criterion.requirement);
    if (wanted === undefined) return result(criterion, "conflict", "living-room requirement must be numeric");
    if (candidate.livingRooms === undefined) return result(criterion, "unknown", "living-room count is missing");
    return result(criterion, candidate.livingRooms >= wanted ? "pass" : "fail", `${candidate.livingRooms} living rooms; requested at least ${wanted}`);
  }
  if (criterion.key === "commute.maxMinutes") {
    const maximum = numberRequirement(criterion.requirement);
    if (maximum === undefined) return result(criterion, "conflict", "commute requirement must include a numeric maximum");
    const values = Object.values(candidate.commuteMinutes ?? {});
    const evidenceIds = Object.values(candidate.commuteEvidence ?? {}).flat();
    if (!values.length) return result(criterion, "unknown", "commute evidence is missing", evidenceIds);
    return result(criterion, Math.max(...values) <= maximum ? "pass" : "fail", `worst commute ${Math.max(...values)} minutes; maximum ${maximum}`, evidenceIds);
  }
  if (criterion.key === "risk.noCriticalIssue") {
    const risks = candidate.riskEvidence ?? [];
    if (!risks.length) return result(criterion, "unknown", "no property-risk evidence was supplied");
    const issue = risks.find((risk) => risk.status === "issue");
    if (issue) return result(criterion, "fail", issue.summary, [issue.id]);
    if (risks.some((risk) => risk.status === "unknown")) return result(criterion, "unknown", "some property-risk checks remain unknown", risks.map((risk) => risk.id));
    return result(criterion, "pass", "supplied property-risk checks are clear", risks.map((risk) => risk.id));
  }
  return result(criterion, "unsupported", `criterion ${criterion.key} is not implemented by property-research`);
}

export function evaluatePropertyCriteria(input: { criteria: readonly PropertyCriterion[]; candidate: PropertyCandidateInput; cost: PropertyCostResult }): CriterionResult[] {
  return input.criteria.map((criterion) => evaluateCriterion(criterion, input.candidate, input.cost));
}

export function eligibilityFromCriteria(results: readonly CriterionResult[]): "eligible" | "needs-verification" | "rejected" {
  if (results.some((item) => item.criterion.kind === "hard" && item.status === "fail")) return "rejected";
  if (results.some((item) => item.criterion.kind === "hard" && ["unknown", "conflict", "unsupported"].includes(item.status))) return "needs-verification";
  return "eligible";
}
