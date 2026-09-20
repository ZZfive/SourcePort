import type {
  PropertyCandidateInput, PropertyGateResult, PropertyIdentityStatus, PropertyVerificationPhase,
  PropertyVerificationTask, PropertyCheckEvidence, PropertyEvidenceIdentity, PropertyResearchBrief, PropertyCostResult,
} from "./contracts.js";

const normalize = (value: string) => value.normalize("NFKC").trim().toLowerCase();
export const UNIT_FIELDS = ["city", "community", "building", "unit", "room"] as const;
export function sameProperty(candidate: PropertyCandidateInput, identity: PropertyEvidenceIdentity | undefined): boolean {
  return Boolean(identity && UNIT_FIELDS.every(key => candidate[key] && normalize(candidate[key]!) === normalize(identity[key])));
}
export function propertyIdentityStatus(candidate: PropertyCandidateInput): PropertyIdentityStatus {
  const rows = [candidate, ...(candidate.observations ?? [])];
  if (["kind", ...UNIT_FIELDS, "address"].some(key => {
    const values = rows.flatMap(row => {
      const value = row[key as keyof PropertyCandidateInput];
      return typeof value === "string" && value.trim() ? [normalize(value)] : [];
    });
    return new Set(values).size > 1;
  })) return "identity-conflict";
  if (UNIT_FIELDS.every(key => candidate[key]?.trim())) return "unit-bound";
  if (candidate.listing || candidate.listings?.length || candidate.identityStatus === "lead-only") return "lead-only";
  return "community-bound";
}

export function checkExclusion(candidate: PropertyCandidateInput, check: PropertyCheckEvidence, now: Date): string | undefined {
  if (check.candidateId !== candidate.candidateId || !sameProperty(candidate, check.propertyIdentity)) return "candidate or unit identity does not match";
  if (!(Date.parse(check.checkedAt) <= now.getTime() && now.getTime() <= Date.parse(check.validUntil))) return "check is stale, future, or has no valid time window";
  if (!check.evidenceIds.length) return "documentary evidence is missing";
  const records = check.evidenceIds.map(id => candidate.evidence?.find(record => record.id === id));
  if (records.some(record => !record || record.verification === "claimed" || !(record.sourceUrl || record.artifactRef) || Date.parse(record.retrievedAt) > now.getTime())) return "evidence reference is missing, claimed, future, or lacks a document";
  return undefined;
}

export const COMMON_CHECKS = ["encumbrance", "transaction-restriction", "property-management", "planning"] as const;
export const NEW_CHECKS = ["presale-permit", "filing", "delivery", "developer", "parking"] as const;
export const RESALE_CHECKS = ["ownership", "lease", "seller-identity", "construction-year", "tax-assessment"] as const;
export const LOAN_CHECKS = ["first-home", "loan-amount", "loan-rate", "loan-term", "loan-ratio", "income-debt", "local-policy"] as const;

export function assessPropertyWorkflow(candidate: PropertyCandidateInput, brief: PropertyResearchBrief, cost: PropertyCostResult, now: Date) {
  const identity = propertyIdentityStatus(candidate);
  const excludedChecks: Array<{ id: string; reason: string }> = [];
  const checks = (candidate.checkEvidence ?? []).filter(check => {
    const reason = checkExclusion(candidate, check, now);
    if (reason) excludedChecks.push({ id: check.id, reason });
    return !reason;
  });
  function task(key: string, phase: PropertyVerificationPhase, required = true): PropertyVerificationTask {
    const rows = checks.filter(x => x.check === key);
    const outcomes = new Set(rows.map(x => x.outcome));
    const conflict = outcomes.size > 1;
    const status = conflict || outcomes.has("issue") ? "blocked"
      : outcomes.has("clear") ? "passed"
      : outcomes.has("not-applicable") && !required ? "waived" : "open";
    return {
      id: `${candidate.candidateId}:${key}`, candidateId: candidate.candidateId, phase, requirement: key,
      evidenceNeeded: [`current exact-unit ${key} assessment with documentary evidence`],
      status, evidenceIds: [...new Set(rows.flatMap(x => x.evidenceIds))],
      reason: conflict ? "conflicting assessments" : !rows.length ? "missing applicable evidence" : rows.map(x => x.summary).join("; "),
    };
  }
  const documentKeys = [...COMMON_CHECKS, ...(candidate.kind === "new" ? NEW_CHECKS : RESALE_CHECKS)];
  const loanMode = brief.financing?.mode;
  const loanKeys = [...LOAN_CHECKS, ...(loanMode === "provident-fund" || loanMode === "combined" ? ["provident-contribution", "provident-amount"] : [])];
  const loanTasks = loanMode === "cash" ? [] : loanKeys.map(key => task(key, "finance"));
  const loanEligibility = {
    status: loanMode === "cash" ? "not-applicable" as const
      : loanTasks.some(x => x.reason === "conflicting assessments") ? "conflict" as const
      : loanTasks.some(x => x.status === "blocked") ? "ineligible" as const
      : loanMode && loanTasks.every(x => x.status === "passed") ? "supported" as const : "unknown" as const,
    checks: loanTasks,
  };
  const verificationTasks = [
    task("viewing", "viewing"), ...documentKeys.map(key => task(key, "document")),
    task("tax-applicability", "finance"), ...loanTasks,
    task("offer-terms", "negotiation"), task("contract-review", "contract"), task("payment-schedule", "contract"),
  ];
  // Unknown check keys remain actionable instead of being silently discarded.
  const supported = new Set([...documentKeys, ...loanKeys, "viewing", "tax-applicability", "offer-terms", "contract-review", "payment-schedule"]);
  for (const check of candidate.checkEvidence ?? []) if (!supported.has(check.check)) excludedChecks.push({ id: check.id, reason: `unsupported check: ${check.check}` });
  const priceRows = (candidate.priceObservations ?? []).filter(row =>
    (row.kind === "offer" || row.kind === "transaction") && row.candidateId === candidate.candidateId &&
    sameProperty(candidate, row.propertyIdentity) && row.verification && row.verification !== "claimed" &&
    row.validUntil && Date.parse(row.observedAt) <= now.getTime() && now.getTime() <= Date.parse(row.validUntil) &&
    row.evidenceIds?.length && row.evidenceIds.every(id => candidate.evidence?.some(e => e.id === id && e.verification !== "claimed" && (e.sourceUrl || e.artifactRef))));
  const priceConflict = new Set(priceRows.map(row => JSON.stringify(row.priceCny))).size > 1;
  const hasOffer = priceRows.some(row => row.kind === "offer");
  const priceBasis = priceRows.length > 0 && !priceConflict;
  function gate(phase: PropertyVerificationPhase, selected: PropertyVerificationTask[], reasons: string[]): PropertyGateResult {
    const pending = selected.filter(x => x.status !== "passed" && x.status !== "waived");
    return { candidateId: candidate.candidateId, phase, status: reasons.length || pending.length ? "paused" : "passed",
      reasons: [...reasons, ...pending.map(x => `${x.requirement}: ${x.reason ?? x.status}`)], tasks: selected };
  }
  const identityReasons = identity === "unit-bound" ? [] : [`exact unit identity required (${identity})`];
  const viewingReasons = identity === "identity-conflict" || identity === "lead-only" ? [`stable property identity required (${identity})`] : [];
  if (!candidate.askingPrice && !candidate.purchasePrice) viewingReasons.push("basic price is missing");
  const documents = verificationTasks.filter(x => x.phase === "document");
  const finance = verificationTasks.filter(x => x.phase === "finance");
  const costReasons = cost.status === "known" && cost.range && cost.range.maximumCny <= brief.budget.maximumAllInCny ? [] : ["all-in budget is unknown, conflicting, or over the configured ceiling"];
  const financeReasons = [...costReasons, ...(["supported", "not-applicable"].includes(loanEligibility.status) ? [] : ["loan eligibility is unresolved"]), ...(priceBasis ? [] : ["current verified offer/transaction price is missing or conflicting"])];
  const gates = [
    gate("viewing", [], viewingReasons),
    gate("document", documents, identityReasons),
    gate("finance", finance, financeReasons),
    gate("negotiation", verificationTasks.filter(x => x.phase === "viewing" || x.phase === "document"), [...identityReasons, ...costReasons, ...(hasOffer ? [] : ["current verified offer is missing"])]),
    gate("contract", verificationTasks, [...identityReasons, ...financeReasons, ...(hasOffer ? [] : ["current verified offer is missing"])]),
  ];
  return { identityStatus: identity, verificationTasks, gates, loanEligibility, excludedChecks };
}
