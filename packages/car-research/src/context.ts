import { createHash } from "node:crypto";

import {
  resolvedDecisionContextLimits,
  validateDecisionContextBrief,
  type DecisionContextBrief,
  type DecisionContextLimits,
  type DecisionInvestigation,
  type DecisionSourceQuery,
  type DecisionSubject,
  type SeedDecisionDocument,
} from "@sourceport/decision-context";

import type { CarCandidate, CarResearchReport } from "./contracts.js";

const MAX_CONTEXT_CANDIDATES = 5;

export interface CarDecisionContextPolicy {
  referenceTime?: string;
  recentDays?: number;
  historyDays?: number;
  maxCandidates?: number;
  manufacturerAliases?: Record<string, string>;
  limits?: Partial<DecisionContextLimits>;
}

interface SupplierIdentity {
  name: string;
  kind: "battery-supplier" | "cell-supplier" | "adas-supplier";
  evidenceIds: string[];
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function daysBefore(reference: Date, days: number): string {
  return new Date(reference.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function candidateEvidence(report: CarResearchReport, candidate: CarCandidate) {
  const ids = new Set(candidate.evidenceIds);
  return report.evidence.filter((evidence) => ids.has(evidence.id));
}

function configurationEvidenceIds(report: CarResearchReport, candidate: CarCandidate): string[] {
  return candidateEvidence(report, candidate)
    .filter((evidence) => evidence.source === "dongchedi" && evidence.operation === "get-trim-configuration")
    .map((evidence) => evidence.id);
}

function supplierValues(field: Record<string, unknown>): string[] {
  const key = text(field["key"]);
  const label = text(field["label"]);
  const identifiesSupplier = /(?:battery|cell).*(?:supplier|brand|manufacturer)|(?:电池|电芯).*(?:供应商|品牌|厂商|生产商)/i.test(`${key} ${label}`);
  if (!identifiesSupplier) return [];
  const direct = text(field["value"]);
  const options = Array.isArray(field["options"])
    ? field["options"].flatMap((option) => object(option) ? [text(option["value"])] : [])
    : [];
  return unique([direct, ...options]).filter((value) => !/^(?:unknown|未知|无|暂无|null)$/i.test(value));
}

function supplierKind(field: Record<string, unknown>): SupplierIdentity["kind"] {
  return /cell|电芯/i.test(`${text(field["key"])} ${text(field["label"])}`)
    ? "cell-supplier"
    : "battery-supplier";
}

function suppliersFor(report: CarResearchReport, candidate: CarCandidate): SupplierIdentity[] {
  const evidenceIds = configurationEvidenceIds(report, candidate);
  if (evidenceIds.length === 0) return [];
  const output: SupplierIdentity[] = [];
  for (const rawField of candidate.configuration) {
    if (!object(rawField)) continue;
    for (const name of supplierValues(rawField)) output.push({ name, kind: supplierKind(rawField), evidenceIds });
  }
  if (object(candidate.drivingAssistance) && object(candidate.drivingAssistance["system"])) {
    const vendor = text(candidate.drivingAssistance["system"]["vendor"]);
    if (vendor) output.push({ name: vendor, kind: "adas-supplier", evidenceIds });
  }
  return output.filter((supplier, index, all) =>
    all.findIndex((item) => item.name === supplier.name && item.kind === supplier.kind) === index);
}

function ownerReviewDocuments(
  report: CarResearchReport,
  candidate: CarCandidate,
  subjectIds: string[],
  investigationId: string,
): SeedDecisionDocument[] {
  const evidenceIds = candidateEvidence(report, candidate)
    .filter((evidence) => evidence.source === "dongchedi" && evidence.operation === "get-owner-reviews")
    .map((evidence) => evidence.id);
  if (evidenceIds.length === 0) return [];
  return candidate.ownerReviews.flatMap((review, index) => {
    if (!object(review)) return [];
    const content = text(review["excerpt"] ?? review["content"]);
    if (!content) return [];
    const reviewId = text(review["reviewId"]) || `${candidate.candidateId}:${index + 1}`;
    const author = text(review["userDisplayName"] ?? review["author"]);
    const url = text(review["sourceUrl"]);
    return [{
      id: `seed:owner:${shortHash(`${candidate.candidateId}:${reviewId}`)}`,
      source: "dongchedi",
      sourceOperation: "get-owner-reviews",
      sourceRole: "owner-platform" as const,
      subjectIds,
      investigationIds: [investigationId],
      title: `${candidate.series.name} owner review${author ? ` by ${author}` : ""}`,
      content,
      ...(url ? { url } : {}),
      sourceItemId: reviewId,
      ...(author ? { author } : {}),
      retrievedAt: candidateEvidence(report, candidate)
        .find((evidence) => evidenceIds.includes(evidence.id))?.retrievedAt ?? report.generatedAt,
      evidenceIds,
    }];
  });
}

function addQuery(
  queries: DecisionSourceQuery[],
  seen: Set<string>,
  query: Omit<DecisionSourceQuery, "id">,
): void {
  const key = `${query.source}:${query.operation}:${JSON.stringify(query.parameters)}`;
  if (seen.has(key)) return;
  seen.add(key);
  queries.push({ id: `query:${queries.length + 1}:${shortHash(key)}`, ...query });
}

export function buildCarDecisionContextBrief(
  report: CarResearchReport,
  policy: CarDecisionContextPolicy = {},
): DecisionContextBrief {
  const reference = new Date(policy.referenceTime ?? report.generatedAt);
  if (Number.isNaN(reference.getTime())) throw new Error("car report generatedAt/referenceTime must be an ISO date");
  const recentDays = policy.recentDays ?? 365;
  const historyDays = policy.historyDays ?? 1095;
  if (!Number.isInteger(recentDays) || recentDays < 1 || !Number.isInteger(historyDays) || historyDays < recentDays) {
    throw new Error("context windows require positive recentDays and historyDays >= recentDays");
  }
  const maxCandidates = Math.min(policy.maxCandidates ?? MAX_CONTEXT_CANDIDATES, MAX_CONTEXT_CANDIDATES);
  if (!Number.isInteger(maxCandidates) || maxCandidates < 1) throw new Error("maxCandidates must be a positive integer");
  const candidates = report.candidates
    .filter((candidate) => candidate.eligibility !== "rejected")
    .slice(0, maxCandidates);
  if (candidates.length === 0) throw new Error("car context requires at least one final non-rejected candidate");
  const limits = resolvedDecisionContextLimits(policy.limits);
  const subjects: DecisionSubject[] = [];
  const investigations: DecisionInvestigation[] = [];
  const sourceQueries: DecisionSourceQuery[] = [];
  const seedDocuments: SeedDecisionDocument[] = [];
  const queryKeys = new Set<string>();
  const selectedEvidenceIds = new Set<string>();
  const manufacturerSubjects = new Map<string, DecisionSubject>();
  const manufacturerSeries = new Map<string, Array<{ seriesId: string; trimId: string }>>();
  const supplierQueries: Array<{ candidate: CarCandidate; supplier: SupplierIdentity; subjectIds: string[]; investigationId: string; manufacturer: string }> = [];

  for (const candidate of candidates) {
    candidate.evidenceIds.forEach((id) => selectedEvidenceIds.add(id));
    const manufacturer = policy.manufacturerAliases?.[candidate.series.brand] ?? candidate.series.brand;
    const manufacturerKey = manufacturer.trim().toLocaleLowerCase("zh-CN");
    const manufacturerId = `manufacturer:${shortHash(manufacturerKey)}`;
    const seriesId = `series:${shortHash(candidate.candidateId)}`;
    const trimId = `trim:${shortHash(candidate.candidateId)}`;
    const candidateEvidenceIds = candidateEvidence(report, candidate).map((evidence) => evidence.id);
    const trimEvidenceIds = configurationEvidenceIds(report, candidate);

    const existingManufacturer = manufacturerSubjects.get(manufacturerKey);
    if (existingManufacturer) {
      existingManufacturer.evidenceIds = unique([...existingManufacturer.evidenceIds, ...candidateEvidenceIds]);
      existingManufacturer.relations = [
        ...(existingManufacturer.relations ?? []),
        { type: "manufactures-series", targetSubjectId: seriesId, evidenceIds: candidateEvidenceIds },
      ];
    } else {
      const subject: DecisionSubject = {
        id: manufacturerId,
        label: manufacturer,
        kind: "manufacturer",
        aliases: unique([candidate.series.brand, manufacturer]),
        evidenceIds: candidateEvidenceIds,
        relations: [{ type: "manufactures-series", targetSubjectId: seriesId, evidenceIds: candidateEvidenceIds }],
        attributes: { identityBasis: "car report brand/manufacturer label; legal entity may require verification" },
      };
      manufacturerSubjects.set(manufacturerKey, subject);
      subjects.push(subject);
    }

    subjects.push({
      id: seriesId,
      label: `${candidate.series.brand} ${candidate.series.name}`.trim(),
      kind: "car-series",
      aliases: unique([candidate.series.name, `${manufacturer} ${candidate.series.name}`]),
      evidenceIds: candidateEvidenceIds,
      relations: [
        { type: "has-exact-trim", targetSubjectId: trimId, evidenceIds: trimEvidenceIds.length > 0 ? trimEvidenceIds : candidateEvidenceIds },
        { type: "manufactured-by", targetSubjectId: manufacturerId, evidenceIds: candidateEvidenceIds },
      ],
      attributes: { candidateId: candidate.candidateId, eligibility: candidate.eligibility },
    });
    subjects.push({
      id: trimId,
      label: `${candidate.trim.year} ${candidate.trim.name}`.trim(),
      kind: "car-trim",
      aliases: unique([candidate.trim.name, `${candidate.series.name} ${candidate.trim.name}`]),
      evidenceIds: trimEvidenceIds.length > 0 ? trimEvidenceIds : candidateEvidenceIds,
      relations: [{ type: "trim-of-series", targetSubjectId: seriesId, evidenceIds: trimEvidenceIds.length > 0 ? trimEvidenceIds : candidateEvidenceIds }],
      attributes: { trimId: candidate.trim.trimId, candidateId: candidate.candidateId },
    });
    manufacturerSeries.set(manufacturerKey, [
      ...(manufacturerSeries.get(manufacturerKey) ?? []),
      { seriesId, trimId },
    ]);

    const ownerInvestigationId = `investigation:owner:${shortHash(candidate.candidateId)}`;
    const recentInvestigationId = `investigation:recent:${shortHash(candidate.candidateId)}`;
    const recallInvestigationId = `investigation:recall:${shortHash(candidate.candidateId)}`;
    investigations.push(
      { id: ownerInvestigationId, label: `${candidate.series.name} owner experience`, category: "owner-experience", subjectIds: [seriesId, trimId], window: { from: daysBefore(reference, recentDays), to: reference.toISOString() } },
      { id: recentInvestigationId, label: `${candidate.series.name} recent events`, category: "recent-events", subjectIds: [seriesId, trimId, manufacturerId], window: { from: daysBefore(reference, recentDays), to: reference.toISOString() } },
      { id: recallInvestigationId, label: `${candidate.series.name} recall and recurring quality history`, category: "recall-quality-history", subjectIds: [seriesId, trimId, manufacturerId], window: { from: daysBefore(reference, historyDays), to: reference.toISOString() } },
    );
    seedDocuments.push(...ownerReviewDocuments(report, candidate, [seriesId, trimId], ownerInvestigationId));
    addQuery(sourceQueries, queryKeys, {
      investigationId: recallInvestigationId,
      subjectIds: [seriesId, trimId, manufacturerId],
      source: "samr",
      operation: "search-notices",
      parameters: {
        query: `${manufacturer} ${candidate.series.name} ${candidate.trim.name} 召回 质量 安全`,
        categories: ["recall", "administrative-penalty", "quality-safety"],
        limit: limits.perQueryDocuments,
      },
      sourceRole: "official-primary",
    });
    addQuery(sourceQueries, queryKeys, {
      investigationId: recentInvestigationId,
      subjectIds: [seriesId, trimId, manufacturerId],
      source: "brave-search",
      operation: "search",
      parameters: { query: `${manufacturer} ${candidate.series.name} 召回 质量 处罚 供应链`, limit: limits.perQueryDocuments, country: "CN", language: "zh-hans" },
      sourceRole: "discovery",
    });
    addQuery(sourceQueries, queryKeys, {
      investigationId: ownerInvestigationId,
      subjectIds: [seriesId, trimId],
      source: "xiaohongshu",
      operation: "search-notes",
      parameters: { query: `${candidate.series.name} ${candidate.trim.name} 真实车主 用车 质量`, limit: 2 },
      sourceRole: "community",
    });

    for (const supplier of suppliersFor(report, candidate)) {
      const supplierId = `supplier:${shortHash(`${supplier.kind}:${supplier.name}`)}`;
      let supplierSubject = subjects.find((subject) => subject.id === supplierId);
      if (!supplierSubject) {
        supplierSubject = { id: supplierId, label: supplier.name, kind: supplier.kind, evidenceIds: supplier.evidenceIds, relations: [] };
        subjects.push(supplierSubject);
      }
      supplierSubject.evidenceIds = unique([...supplierSubject.evidenceIds, ...supplier.evidenceIds]);
      supplierSubject.relations = [
        ...(supplierSubject.relations ?? []),
        { type: "supplies-exact-trim", targetSubjectId: trimId, evidenceIds: supplier.evidenceIds },
      ];
      supplierQueries.push({ candidate, supplier, subjectIds: [seriesId, trimId, manufacturerId, supplierId], investigationId: recentInvestigationId, manufacturer });
    }
  }

  for (const [manufacturerKey, subject] of manufacturerSubjects) {
    const related = manufacturerSeries.get(manufacturerKey) ?? [];
    const investigationId = `investigation:manufacturer:${shortHash(manufacturerKey)}`;
    investigations.push({
      id: investigationId,
      label: `${subject.label} recent company events`,
      category: "manufacturer-events",
      subjectIds: [subject.id, ...related.flatMap((item) => [item.seriesId, item.trimId])],
      window: { from: daysBefore(reference, recentDays), to: reference.toISOString() },
    });
    addQuery(sourceQueries, queryKeys, {
      investigationId,
      subjectIds: [subject.id, ...related.map((item) => item.seriesId)],
      source: "36kr",
      operation: "search-articles",
      parameters: { query: `${subject.label} 召回 处罚 质量 供应链`, limit: limits.perQueryDocuments },
      sourceRole: "media-secondary",
    });
  }

  for (const item of supplierQueries) {
    if (sourceQueries.length >= limits.sourceQueries) break;
    addQuery(sourceQueries, queryKeys, {
      investigationId: item.investigationId,
      subjectIds: item.subjectIds,
      source: "36kr",
      operation: "search-articles",
      parameters: { query: `${item.manufacturer} ${item.candidate.series.name} ${item.supplier.name} 质量 处罚 召回`, limit: limits.perQueryDocuments },
      sourceRole: "media-secondary",
    });
  }

  const seedEvidence = report.evidence.filter((evidence) => selectedEvidenceIds.has(evidence.id));
  const brief: DecisionContextBrief = {
    domain: "cars",
    query: `${report.query} — decision context for final candidates only`,
    market: { ...report.market },
    subjects,
    investigations,
    sourceQueries: sourceQueries.slice(0, limits.sourceQueries),
    seedDocuments,
    seedEvidence,
    limits,
    freshness: { mode: "live" },
  };
  const validation = validateDecisionContextBrief(brief);
  if (!validation.ok) {
    throw new Error(`generated DecisionContextBrief is invalid: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
  return brief;
}
