import type { EvidenceRecord, RecoveryAction, SourceWarning } from "@sourceport/core";
import { calculateAllInCost, calculateMortgageScenarios, propertyCostEvidenceRecord } from "./finance.js";
import { deduplicatePropertyCandidates } from "./entity-resolution.js";
import { eligibilityFromCriteria, evaluatePropertyCriteria } from "./criteria.js";
import { PROPERTY_RESEARCH_LIMITS, resolvedPropertyLimits, validatePropertyResearchBrief, type PropertyCandidate, type PropertyCandidateInput, type PropertyResearchBrief, type PropertyResearchDependencies, type PropertyResearchReport, type PropertyRiskEvidence } from "./contracts.js";
import { validatePropertyCandidates } from "./validation.js";

function propertyRiskEvidenceRecord(evidence: PropertyRiskEvidence): EvidenceRecord {
  return { id: evidence.id, source: evidence.source, operation: "property-research-risk-evidence", backend: "brief", retrievedAt: evidence.retrievedAt, ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}), fragment: evidence, verification: "claimed" };
}

function defaultCriteria(brief: PropertyResearchBrief) {
  const explicit = new Set((brief.criteria ?? []).map((criterion) => criterion.key));
  return [
    ...(explicit.has("budget.allIn.maxCny") ? [] : [{ key: "budget.allIn.maxCny", label: "总包预算", kind: "hard" as const, priority: 100, requirement: { max: brief.budget.maximumAllInCny } }]),
    ...(brief.layout?.bedrooms && !explicit.has("layout.bedrooms") ? [{ key: "layout.bedrooms", label: "卧室数量", kind: "preference" as const, priority: 80, requirement: brief.layout.bedrooms }] : []),
    ...(brief.layout?.livingRooms && !explicit.has("layout.livingRooms") ? [{ key: "layout.livingRooms", label: "客厅数量", kind: "preference" as const, priority: 70, requirement: brief.layout.livingRooms }] : []),
    ...(explicit.has("risk.noCriticalIssue") ? [] : [{ key: "risk.noCriticalIssue", label: "关键产权与交易风险", kind: "hard" as const, priority: 95, requirement: "clear" }]),
  ];
}

function buildCandidate(input: PropertyCandidateInput, brief: PropertyResearchBrief, now: Date): PropertyCandidate {
  const allInCost = calculateAllInCost({ market: brief.market.city, candidateIds: [input.candidateId], now, ...(input.purchasePrice ? { purchasePrice: input.purchasePrice } : {}), ...(input.costEvidence ? { costEvidence: input.costEvidence } : {}) });
  const financing = calculateMortgageScenarios({ ...(input.purchasePrice ? { purchasePrice: input.purchasePrice } : {}), allInCost, ...(brief.financing ? { downPaymentRatios: brief.financing.downPaymentRatios, annualRates: brief.financing.annualRates, termsMonths: brief.financing.termsMonths } : {}) });
  const explicitCriteria = new Set((brief.criteria ?? []).map((criterion) => criterion.key));
  const askingCriteria = input.askingPrice && !explicitCriteria.has("budget.asking.maxCny")
    ? [{ key: "budget.asking.maxCny", label: "挂牌价上限（线索筛选）", kind: "hard" as const, priority: 99, requirement: { max: brief.budget.maximumAllInCny } }]
    : [];
  const criteria = [...defaultCriteria(brief), ...askingCriteria, ...(brief.criteria ?? [])];
  const criterionResults = evaluatePropertyCriteria({ criteria, candidate: input, cost: allInCost });
  const commute = brief.commuteAnchors.map((anchor) => ({ anchorId: anchor.id, label: anchor.label, ...(input.commuteMinutes?.[anchor.id] === undefined ? {} : { minutes: input.commuteMinutes[anchor.id] }), status: input.commuteMinutes?.[anchor.id] === undefined ? "unknown" as const : "known" as const, evidenceIds: input.commuteEvidence?.[anchor.id] ?? [] }));
  const evidence = [...(input.evidence ?? []), ...(input.costEvidence ?? []).map(propertyCostEvidenceRecord), ...(input.riskEvidence ?? []).map(propertyRiskEvidenceRecord)];
  const dueDiligence = input.riskEvidence?.map((risk) => ({ criterion: { key: `risk.${risk.category}`, label: risk.category, kind: "hard" as const, priority: 90, requirement: "clear" }, status: risk.status === "clear" ? "pass" as const : risk.status === "issue" ? "fail" as const : "unknown" as const, message: risk.summary, evidenceIds: [risk.id] })) ?? [];
  const commuteValues = commute.flatMap(item => item.minutes === undefined ? [] : [item.minutes]);
  const observations = input.observations ?? [input];
  const conflicts: Array<{ field: string; values: unknown[] }> = [];
  for (const field of ["kind", "city", "community", "address", "areaSqm", "bedrooms", "livingRooms", "floor", "constructionYear", "propertyRightsYears", "askingPrice", "purchasePrice"]) {
    const values = [...new Map(observations.map(item => [JSON.stringify(item[field as keyof PropertyCandidateInput]), item[field as keyof PropertyCandidateInput]])).values()];
    if (values.length > 1) conflicts.push({ field, values });
  }
  if (conflicts.length) allInCost.reasons.push(`conflicting observations require reconciliation: ${conflicts.map(item => item.field).join(", ")}`);
  if (conflicts.length) allInCost.status = "conflict";
  const actionItems = [
    ...(input.askingPrice && !input.purchasePrice ? ["将挂牌价与同小区近期成交价或明确议价证据核验后，再判断总包预算"] : []),
    ...(allInCost.status !== "known" ? ["核验交易价、税费、中介费、维修基金、装修和车位等总包组成"] : []),
    ...(input.kind === "new" ? ["核验项目、楼栋和房号对应的预售许可证、交付时间和备案合同"] : ["核验不动产权证、抵押/查封/租赁、卖方主体和存量房评估价"]),
    ...(commuteValues.length < brief.commuteAnchors.length ? [`补齐${brief.commuteAnchors.length}个通勤锚点的同口径路线证据、出行方式和时段`] : []),
  ];
  return {
    candidateId: input.candidateId,
    eligibility: eligibilityFromCriteria(criterionResults),
    kind: input.kind,
    identity: { city: input.city, ...(input.district ? { district: input.district } : {}), community: input.community, ...(input.address ? { address: input.address } : {}), ...(input.building ? { building: input.building } : {}), ...(input.unit ? { unit: input.unit } : {}), ...(input.room ? { room: input.room } : {}) },
    attributes: { ...(input.areaSqm === undefined ? {} : { areaSqm: input.areaSqm }), ...(input.bedrooms === undefined ? {} : { bedrooms: input.bedrooms }), ...(input.livingRooms === undefined ? {} : { livingRooms: input.livingRooms }), ...(input.floor ? { floor: input.floor } : {}), ...(input.constructionYear === undefined ? {} : { constructionYear: input.constructionYear }), ...(input.propertyRightsYears === undefined ? {} : { propertyRightsYears: input.propertyRightsYears }), ...(input.developer ? { developer: input.developer } : {}), ...(input.deliveryDate ? { deliveryDate: input.deliveryDate } : {}) },
    listings: [...new Map([...(input.listing ? [input.listing] : []), ...(input.listings ?? [])].map((item) => [item.listingId, item])).values()],
    ...(input.askingPrice ? { askingPrice: input.askingPrice } : {}),
    priceObservations: input.priceObservations ?? [],
    ...(input.purchasePrice ? { purchasePrice: input.purchasePrice } : {}),
    allInCost,
    financing,
    commute,
    risks: input.riskEvidence ?? [],
    dueDiligence,
    observations,
    conflicts,
    commuteSummary: { ...(commuteValues.length ? { worstMinutes: Math.max(...commuteValues), meanMinutes: commuteValues.reduce((a, b) => a + b, 0) / commuteValues.length } : {}), complete: commuteValues.length === brief.commuteAnchors.length },
    actionItems,
    criterionResults,
    evidenceIds: [...new Set(evidence.map((item) => item.id))],
    sourceUrls: [...new Set([...(input.sourceUrls ?? []), ...(input.listing ? [input.listing.sourceUrl] : []), ...evidence.flatMap((item) => item.sourceUrl ? [item.sourceUrl] : [])])],
  };
}

function emptyReport(input: unknown, now: Date, issues: Array<{ path: string; message: string }>): PropertyResearchReport {
  const record = input !== null && typeof input === "object" && !Array.isArray(input) ? input as Record<string, unknown> : {};
  const market = record["market"] !== null && typeof record["market"] === "object" && !Array.isArray(record["market"]) ? record["market"] as Record<string, unknown> : {};
  return { status: "failed", query: typeof record["query"] === "string" ? record["query"] : "", market: { city: typeof market["city"] === "string" ? market["city"] : "" }, generatedAt: now.toISOString(), candidates: [], rejected: [], allCandidates: [], coverage: { mode: "bounded", limits: PROPERTY_RESEARCH_LIMITS, inputCandidates: 0, deduplicatedCandidates: 0, evaluatedCandidates: 0, displayedCandidates: 0, byKind: { new: { input: 0, evaluated: 0, displayed: 0 }, resale: { input: 0, evaluated: 0, displayed: 0 } }, exclusions: [], limitations: ["research did not start because the brief was invalid"] }, warnings: [], recoveryActions: [], evidence: [], failure: { code: "invalid_brief", message: "invalid PropertyResearchBrief", issues } };
}

export async function researchProperties(input: unknown, dependencies: PropertyResearchDependencies = {}): Promise<PropertyResearchReport> {
  const now = dependencies.now ?? (() => new Date());
  const validation = validatePropertyResearchBrief(input);
  if (!validation.ok) return emptyReport(input, now(), validation.issues);
  const brief = validation.value;
  const limits = resolvedPropertyLimits(brief.limits);
  const rawCandidates = dependencies.candidates ?? [];
  const candidateValidation = validatePropertyCandidates(rawCandidates);
  if (!candidateValidation.ok) return { status: "failed", query: brief.query, market: brief.market, generatedAt: now().toISOString(), candidates: [], rejected: [], allCandidates: [], coverage: { mode: "bounded", limits, inputCandidates: 0, deduplicatedCandidates: 0, evaluatedCandidates: 0, displayedCandidates: 0, byKind: { new: { input: 0, evaluated: 0, displayed: 0 }, resale: { input: 0, evaluated: 0, displayed: 0 } }, exclusions: [], limitations: ["candidate validation failed"] }, warnings: [], recoveryActions: [], evidence: [], failure: { code: "invalid_candidates", message: "invalid normalized property candidates", issues: candidateValidation.issues } };
  const normalizedCandidates = candidateValidation.value;
  const scopeExclusions = normalizedCandidates
    .filter((candidate) => !brief.housingTypes.includes(candidate.kind) || candidate.city !== brief.market.city)
    .map((candidate) => ({
      candidateId: candidate.candidateId,
      reason: candidate.city !== brief.market.city
        ? `candidate city '${candidate.city}' is outside market '${brief.market.city}'`
        : `candidate kind '${candidate.kind}' is outside requested housing types`,
    }));
  const inScope = normalizedCandidates.filter((candidate) => brief.housingTypes.includes(candidate.kind) && candidate.city === brief.market.city);
  const supplied = inScope.slice(0, limits.initialCandidates);
  const capExclusions = inScope.slice(limits.initialCandidates).map((candidate) => ({
    candidateId: candidate.candidateId,
    reason: `candidate discovery cap of ${limits.initialCandidates} reached`,
  }));
  const deduplicated = deduplicatePropertyCandidates(supplied).slice(0, limits.evaluatedCandidates);
  const evaluated = deduplicated.map((candidate) => buildCandidate(candidate, brief, now()));
  const sorted = [...evaluated].sort((a, b) => {
    const eligibility = { eligible: 0, "needs-verification": 1, rejected: 2 } as const;
    const status = eligibility[a.eligibility] - eligibility[b.eligibility];
    if (status) return status;
    const aWorst = Math.max(...a.commute.flatMap((item) => item.minutes === undefined ? [] : [item.minutes]), Number.POSITIVE_INFINITY);
    const bWorst = Math.max(...b.commute.flatMap((item) => item.minutes === undefined ? [] : [item.minutes]), Number.POSITIVE_INFINITY);
    if (aWorst !== bWorst) return aWorst - bWorst;
    return (a.allInCost.estimateRange?.minimumCny ?? a.askingPrice?.minimumCny ?? Number.POSITIVE_INFINITY) - (b.allInCost.estimateRange?.minimumCny ?? b.askingPrice?.minimumCny ?? Number.POSITIVE_INFINITY);
  });
  const candidates = sorted.filter((candidate) => candidate.eligibility !== "rejected").slice(0, limits.finalCandidates);
  const rejected = sorted.filter((candidate) => candidate.eligibility === "rejected");
  const availableEvidence = candidateValidation.value.flatMap((item) => [
    ...(item.evidence ?? []),
    ...(item.costEvidence ?? []).map(propertyCostEvidenceRecord),
    ...(item.riskEvidence ?? []).map(propertyRiskEvidenceRecord),
  ]);
  const evidence = [...new Map(evaluated.flatMap((candidate) => candidate.evidenceIds.map((id) => availableEvidence.find((record) => record.id === id)).filter((record): record is EvidenceRecord => Boolean(record)).map((record) => [record.id, record] as const))).values()];
  const warnings: SourceWarning[] = [];
  const recoveryActions: RecoveryAction[] = [];
  const limitations: string[] = [];
  if (!supplied.length) limitations.push("no normalized candidates matching the requested market were supplied; run property-discover or provide a candidates file");
  if (scopeExclusions.length) limitations.push("some normalized candidates were excluded because their city or housing type did not match the brief");
  if (capExclusions.length) limitations.push(`candidate discovery was capped at ${limits.initialCandidates}`);
  if (!capExclusions.length && supplied.length >= limits.initialCandidates) limitations.push(`candidate discovery was capped at ${limits.initialCandidates}`);
  if (evaluated.some((candidate) => candidate.allInCost.status !== "known")) limitations.push("some all-in totals are unknown or estimates because a verified transaction price and/or tax, agency, renovation, or other applicable cost evidence is missing");
  if (evaluated.some((candidate) => candidate.financing.status !== "scenario")) limitations.push("monthly-payment scenarios remain unknown because down-payment, rate, or term inputs are missing");
  const byKind = { new: { input: supplied.filter(x => x.kind === "new").length, evaluated: evaluated.filter(x => x.kind === "new").length, displayed: candidates.filter(x => x.kind === "new").length }, resale: { input: supplied.filter(x => x.kind === "resale").length, evaluated: evaluated.filter(x => x.kind === "resale").length, displayed: candidates.filter(x => x.kind === "resale").length } };
  const exclusions = [...scopeExclusions, ...capExclusions, ...rejected.map(candidate => ({ candidateId: candidate.candidateId, reason: candidate.criterionResults.filter(x => x.status === "fail").map(x => x.message).join("; ") }))];
  return { status: supplied.length ? (evaluated.some((candidate) => candidate.eligibility === "needs-verification") ? "partial" : "success") : "partial", query: brief.query, market: brief.market, generatedAt: now().toISOString(), candidates, rejected, allCandidates: evaluated, brief, coverage: { mode: "bounded", limits, inputCandidates: normalizedCandidates.length, deduplicatedCandidates: deduplicated.length, evaluatedCandidates: evaluated.length, displayedCandidates: candidates.length, byKind, exclusions, limitations }, warnings, recoveryActions, evidence };
}
