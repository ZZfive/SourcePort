import type {
  CompiledDecisionEvent,
  DecisionCompilationResult,
  DecisionContextAssessmentInput,
  DecisionContextReport,
  DecisionDocument,
  DecisionEventAssessment,
  DecisionEvidenceCorpus,
  DecisionFlag,
  DecisionSubject,
  DecisionValidationIssue,
} from "./contracts.js";
import {
  validateDecisionContextAssessment,
  validateDecisionEvidenceCorpus,
} from "./validate.js";

const DIRECT_SUBJECT_KINDS = new Set([
  "car-series",
  "car-trim",
  "vehicle",
  "production-batch",
  "vehicle-batch",
]);

function referencedDocuments(
  ids: string[],
  documents: Map<string, DecisionDocument>,
): DecisionDocument[] {
  return ids.flatMap((id) => {
    const document = documents.get(id);
    return document ? [document] : [];
  });
}

function independentSources(documents: DecisionDocument[]): number {
  return new Set(
    documents
      .filter((document) => document.sourceRole !== "discovery")
      .map((document) => document.source),
  ).size;
}

function unresolved(remediation: DecisionEventAssessment["remediation"]): boolean {
  return remediation !== "completed";
}

export function deriveDecisionFlag(
  event: DecisionEventAssessment,
  sourceCount: number,
  hasOfficialPrimary: boolean,
): DecisionFlag {
  if (event.verification === "unverified" || event.applicability === "not-applicable") {
    return "context-only";
  }
  if (event.verification === "conflict") return "verify-before-buy";
  if (event.applicability === "indirect" || event.applicability === "unknown") return "watch";
  const verifiedForPause = hasOfficialPrimary ||
    (event.verification === "supported" && sourceCount >= 2);
  if (
    event.applicability === "direct" &&
    (event.severity === "critical" || event.severity === "high") &&
    unresolved(event.remediation) &&
    verifiedForPause
  ) {
    return "pause";
  }
  if (event.applicability === "direct" && (event.severity === "critical" || event.severity === "high")) {
    return "verify-before-buy";
  }
  if (event.applicability === "direct" && event.severity === "medium" && event.remediation !== "completed") {
    return "verify-before-buy";
  }
  return "watch";
}

function validateReferences(
  assessment: DecisionContextAssessmentInput,
  corpus: DecisionEvidenceCorpus,
  issues: DecisionValidationIssue[],
): void {
  const subjectIds = new Set(corpus.brief.subjects.map((subject) => subject.id));
  const documentIds = new Set(corpus.documents.map((document) => document.id));
  const evidenceIds = new Set(corpus.evidence.map((evidence) => evidence.id));
  const groups: Array<[string, Array<{ subjectIds: string[]; documentIds: string[]; evidenceIds: string[] }>]> = [
    ["events", assessment.events],
    ["ownerSignals", assessment.ownerSignals],
    ["conflicts", assessment.conflicts],
    ["unknowns", assessment.unknowns],
  ];
  for (const [group, items] of groups) items.forEach((item, index) => {
    item.subjectIds.forEach((id) => {
      if (!subjectIds.has(id)) issues.push({ path: `${group}.${index}.subjectIds`, message: `unknown subject '${id}'` });
    });
    item.documentIds.forEach((id) => {
      if (!documentIds.has(id)) issues.push({ path: `${group}.${index}.documentIds`, message: `unknown document '${id}'` });
    });
    item.evidenceIds.forEach((id) => {
      if (!evidenceIds.has(id)) issues.push({ path: `${group}.${index}.evidenceIds`, message: `unknown evidence '${id}'` });
    });
  });
}

function supplierSubject(subject: DecisionSubject): boolean {
  return subject.kind.includes("supplier") || subject.kind === "battery-maker" || subject.kind === "component-maker";
}

function hasDirectSupplierRelation(
  event: DecisionEventAssessment,
  subjects: Map<string, DecisionSubject>,
  evidenceIds: Set<string>,
): boolean {
  const eventSubjects = event.subjectIds.flatMap((id) => {
    const subject = subjects.get(id);
    return subject ? [subject] : [];
  });
  const suppliers = eventSubjects.filter(supplierSubject);
  const directTargets = eventSubjects.filter((subject) => DIRECT_SUBJECT_KINDS.has(subject.kind));
  if (suppliers.length === 0) return true;
  if (directTargets.length === 0) return false;
  const supplierIds = new Set(suppliers.map((subject) => subject.id));
  const targetIds = new Set(directTargets.map((subject) => subject.id));
  return eventSubjects.some((subject) => (subject.relations ?? []).some((relation) => {
    const connectsSupplierAndTarget =
      (supplierIds.has(subject.id) && targetIds.has(relation.targetSubjectId)) ||
      (targetIds.has(subject.id) && supplierIds.has(relation.targetSubjectId));
    return connectsSupplierAndTarget && relation.evidenceIds.some((id) =>
      evidenceIds.has(id) && event.evidenceIds.includes(id));
  }));
}

export function compileDecisionContext(
  corpusInput: unknown,
  assessmentInput: unknown,
  now: () => Date = () => new Date(),
): DecisionCompilationResult {
  const corpusValidation = validateDecisionEvidenceCorpus(corpusInput);
  const assessmentValidation = validateDecisionContextAssessment(assessmentInput);
  const issues: DecisionValidationIssue[] = [
    ...corpusValidation.issues,
    ...assessmentValidation.issues,
  ];
  if (!corpusValidation.value || !assessmentValidation.value) return { ok: false, issues };

  const corpus = corpusValidation.value;
  const assessment = assessmentValidation.value;
  validateReferences(assessment, corpus, issues);
  const documentMap = new Map(corpus.documents.map((document) => [document.id, document]));
  const subjectMap = new Map(corpus.brief.subjects.map((subject) => [subject.id, subject]));
  const evidenceIds = new Set(corpus.evidence.map((evidence) => evidence.id));

  const compiledEvents: CompiledDecisionEvent[] = assessment.events.map((event, index) => {
    const documents = referencedDocuments(event.documentIds, documentMap);
    const sourceCount = independentSources(documents);
    const roles = new Set(documents.map((document) => document.sourceRole));
    const hasOfficialPrimary = roles.has("official-primary");
    const nonDiscoveryDocuments = documents.filter((document) => document.sourceRole !== "discovery");
    if (nonDiscoveryDocuments.length === 0 && event.verification !== "unverified") {
      issues.push({ path: `events.${index}.verification`, message: "discovery-only evidence can only be unverified" });
    }
    if (event.verification === "confirmed" && !hasOfficialPrimary) {
      issues.push({ path: `events.${index}.verification`, message: "confirmed requires official-primary evidence" });
    }
    if (event.verification === "supported" && sourceCount < 2) {
      issues.push({ path: `events.${index}.verification`, message: "supported requires at least two independent source families" });
    }
    if (event.verification === "single-source" && sourceCount !== 1) {
      issues.push({ path: `events.${index}.verification`, message: "single-source requires exactly one non-discovery source family" });
    }
    if (event.verification === "conflict" && sourceCount < 2) {
      issues.push({ path: `events.${index}.verification`, message: "conflict requires at least two independent source families" });
    }
    if (
      event.applicability === "direct" &&
      !hasDirectSupplierRelation(event, subjectMap, evidenceIds)
    ) {
      issues.push({
        path: `events.${index}.applicability`,
        message: "supplier evidence is not directly connected to an exact vehicle, trim, or batch",
      });
    }
    const hasKnownDate = Boolean(event.occurredAt) || documents.some((document) => Boolean(document.publishedAt));
    if (!hasKnownDate && /(?:recent|recently|近期|最近)/i.test(`${event.title} ${event.summary}`)) {
      issues.push({ path: `events.${index}.occurredAt`, message: "unknown publication dates cannot be described as recent" });
    }
    return {
      ...event,
      decisionFlag: deriveDecisionFlag(event, sourceCount, hasOfficialPrimary),
      independentSources: sourceCount,
      dateStatus: hasKnownDate ? "known" : "unknown",
    };
  });

  const compiledOwnerSignals = assessment.ownerSignals.map((signal, index) => {
    const documents = referencedDocuments(signal.documentIds, documentMap);
    const distinctDocuments = new Set(documents.map((document) => document.contentHash)).size;
    const distinctAuthors = new Set(documents.map((document) => document.author).filter(Boolean)).size;
    const distinctItemsOrAuthors = Math.max(distinctDocuments, distinctAuthors);
    const distinctSources = new Set(documents.map((document) => document.source)).size;
    if (documents.some((document) => document.sourceRole !== "owner-platform" && document.sourceRole !== "community")) {
      issues.push({ path: `ownerSignals.${index}.documentIds`, message: "owner signals may only use owner-platform or community documents" });
    }
    if ((signal.recurrence === "repeated" || signal.recurrence === "cross-source") && distinctItemsOrAuthors < 3) {
      issues.push({ path: `ownerSignals.${index}.recurrence`, message: "repeated owner signals require at least three distinct content items or authors" });
    }
    if (signal.recurrence === "cross-source" && distinctSources < 2) {
      issues.push({ path: `ownerSignals.${index}.recurrence`, message: "cross-source owner signals require at least two source families" });
    }
    return { ...signal, distinctDocuments, distinctSources };
  });

  const compiledConflicts = assessment.conflicts.map((conflict, index) => {
    const documents = referencedDocuments(conflict.documentIds, documentMap);
    const sourceCount = independentSources(documents);
    if (sourceCount < 2) issues.push({ path: `conflicts.${index}.documentIds`, message: "a conflict requires at least two independent source families" });
    return { ...conflict, independentSources: sourceCount };
  });

  if (issues.length > 0) return { ok: false, issues };
  const report: DecisionContextReport = {
    status: corpus.status === "success" &&
      assessment.unknowns.length === 0 &&
      assessment.conflicts.length === 0 &&
      assessment.events.every((event) => event.verification !== "unverified" && event.verification !== "conflict" && event.applicability !== "unknown")
      ? "success"
      : "partial",
    generatedAt: now().toISOString(),
    domain: corpus.brief.domain,
    query: corpus.brief.query,
    subjects: corpus.brief.subjects,
    events: compiledEvents,
    ownerSignals: compiledOwnerSignals,
    conflicts: compiledConflicts,
    unknowns: assessment.unknowns,
    documents: corpus.documents,
    evidence: corpus.evidence,
    warnings: corpus.warnings,
    recoveryActions: corpus.recoveryActions,
    coverage: corpus.coverage,
  };
  return { ok: true, report, issues: [] };
}
