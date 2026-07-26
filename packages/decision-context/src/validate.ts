import {
  MAX_DECISION_CONTEXT_LIMITS,
  type DecisionContextAssessmentInput,
  type DecisionContextBrief,
  type DecisionEvidenceCorpus,
  type DecisionValidationIssue,
  type DecisionValidationResult,
} from "./contracts.js";

const SOURCE_ROLES = new Set([
  "official-primary",
  "company-primary",
  "media-secondary",
  "owner-platform",
  "community",
  "discovery",
]);
const VERIFICATIONS = new Set(["confirmed", "supported", "single-source", "unverified", "conflict"]);
const APPLICABILITIES = new Set(["direct", "indirect", "unknown", "not-applicable"]);
const SEVERITIES = new Set(["critical", "high", "medium", "low", "unknown"]);
const REMEDIATIONS = new Set(["none", "announced", "in-progress", "completed", "unknown"]);
const POLARITIES = new Set(["positive", "negative", "mixed"]);
const RECURRENCES = new Set(["anecdotal", "repeated", "cross-source"]);

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim());
}

function validDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonEmpty);
}

function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}

function uniqueIds(items: unknown[], path: string, issues: DecisionValidationIssue[]): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (!object(item) || !nonEmpty(item["id"])) return;
    const id = item["id"];
    if (seen.has(id)) issues.push({ path: `${path}.${index}.id`, message: `duplicate id '${id}'` });
    seen.add(id);
  });
}

function requiredStringArray(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: DecisionValidationIssue[],
): void {
  if (!stringArray(record[key]) || record[key].length === 0) {
    issues.push({ path: `${path}.${key}`, message: `${key} must be a non-empty string array` });
  }
}

function validateReferenceArray(
  value: unknown,
  known: Set<string>,
  path: string,
  label: string,
  issues: DecisionValidationIssue[],
): void {
  if (!stringArray(value)) return;
  for (const id of value) {
    if (!known.has(id)) issues.push({ path, message: `unknown ${label} '${id}'` });
  }
}

function expectedKnownSourceRole(source: unknown, operation: unknown): string | undefined {
  const key = `${String(source)}.${String(operation)}`;
  return {
    "brave-search.search": "discovery",
    "samr.search-notices": "discovery",
    "samr.get-notice": "official-primary",
    "36kr.search-articles": "discovery",
    "36kr.get-article": "media-secondary",
    "xiaohongshu.search-notes": "discovery",
    "xiaohongshu.get-note": "community",
    "xiaohongshu.get-comments": "community",
    "dongchedi.get-owner-reviews": "owner-platform",
  }[key];
}

export function validateDecisionContextBrief(input: unknown): DecisionValidationResult<DecisionContextBrief> {
  const issues: DecisionValidationIssue[] = [];
  if (!object(input)) return { ok: false, issues: [{ path: "", message: "brief must be an object" }] };
  if (!nonEmpty(input["domain"])) issues.push({ path: "domain", message: "domain must be non-empty" });
  if (!nonEmpty(input["query"])) issues.push({ path: "query", message: "query must be non-empty" });

  const subjects = input["subjects"];
  const investigations = input["investigations"];
  const queries = input["sourceQueries"];
  const seedDocuments = input["seedDocuments"];
  const seedEvidence = input["seedEvidence"];

  if (!Array.isArray(subjects) || subjects.length === 0) {
    issues.push({ path: "subjects", message: "subjects must contain at least one item" });
  } else {
    uniqueIds(subjects, "subjects", issues);
    subjects.forEach((subject, index) => {
      if (!object(subject)) return issues.push({ path: `subjects.${index}`, message: "subject must be an object" });
      if (!nonEmpty(subject["id"])) issues.push({ path: `subjects.${index}.id`, message: "id is required" });
      if (!nonEmpty(subject["label"])) issues.push({ path: `subjects.${index}.label`, message: "label is required" });
      if (!nonEmpty(subject["kind"])) issues.push({ path: `subjects.${index}.kind`, message: "kind is required" });
      if (!stringArray(subject["evidenceIds"])) issues.push({ path: `subjects.${index}.evidenceIds`, message: "evidenceIds must be a string array" });
      if (subject["aliases"] !== undefined && !stringArray(subject["aliases"])) issues.push({ path: `subjects.${index}.aliases`, message: "aliases must be a string array" });
      if (subject["relations"] !== undefined && !Array.isArray(subject["relations"])) {
        issues.push({ path: `subjects.${index}.relations`, message: "relations must be an array" });
      } else if (Array.isArray(subject["relations"])) {
        subject["relations"].forEach((relation, relationIndex) => {
          const path = `subjects.${index}.relations.${relationIndex}`;
          if (!object(relation)) return issues.push({ path, message: "relation must be an object" });
          if (!nonEmpty(relation["type"])) issues.push({ path: `${path}.type`, message: "type is required" });
          if (!nonEmpty(relation["targetSubjectId"])) issues.push({ path: `${path}.targetSubjectId`, message: "targetSubjectId is required" });
          requiredStringArray(relation, "evidenceIds", path, issues);
        });
      }
    });
  }

  if (!Array.isArray(investigations) || investigations.length === 0) {
    issues.push({ path: "investigations", message: "investigations must contain at least one item" });
  } else {
    uniqueIds(investigations, "investigations", issues);
    investigations.forEach((investigation, index) => {
      const path = `investigations.${index}`;
      if (!object(investigation)) return issues.push({ path, message: "investigation must be an object" });
      for (const key of ["id", "label", "category"] as const) {
        if (!nonEmpty(investigation[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
      }
      requiredStringArray(investigation, "subjectIds", path, issues);
      const window = investigation["window"];
      if (!object(window) || !validDate(window["from"])) {
        issues.push({ path: `${path}.window.from`, message: "window.from must be an ISO date" });
      }
      if (object(window) && window["to"] !== undefined && !validDate(window["to"])) {
        issues.push({ path: `${path}.window.to`, message: "window.to must be an ISO date" });
      }
      if (object(window) && validDate(window["from"]) && validDate(window["to"]) && Date.parse(window["from"]) > Date.parse(window["to"])) {
        issues.push({ path: `${path}.window`, message: "window.from cannot be after window.to" });
      }
    });
  }

  if (!Array.isArray(queries)) {
    issues.push({ path: "sourceQueries", message: "sourceQueries must be an array" });
  } else {
    uniqueIds(queries, "sourceQueries", issues);
    if (queries.length > MAX_DECISION_CONTEXT_LIMITS.sourceQueries) {
      issues.push({ path: "sourceQueries", message: `sourceQueries cannot exceed ${MAX_DECISION_CONTEXT_LIMITS.sourceQueries}` });
    }
    queries.forEach((query, index) => {
      const path = `sourceQueries.${index}`;
      if (!object(query)) return issues.push({ path, message: "query must be an object" });
      for (const key of ["id", "investigationId", "source", "operation"] as const) {
        if (!nonEmpty(query[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
      }
      if (!SOURCE_ROLES.has(String(query["sourceRole"]))) issues.push({ path: `${path}.sourceRole`, message: "sourceRole is invalid" });
      requiredStringArray(query, "subjectIds", path, issues);
      if (!("parameters" in query)) issues.push({ path: `${path}.parameters`, message: "parameters are required" });
      if (query["required"] !== undefined && typeof query["required"] !== "boolean") issues.push({ path: `${path}.required`, message: "required must be boolean" });
    });
  }

  if (input["limits"] !== undefined) {
    if (!object(input["limits"])) {
      issues.push({ path: "limits", message: "limits must be an object" });
    } else {
      for (const [key, maximum] of Object.entries(MAX_DECISION_CONTEXT_LIMITS)) {
        const value = input["limits"][key];
        if (value !== undefined && (!positiveInteger(value) || Number(value) > maximum)) {
          issues.push({ path: `limits.${key}`, message: `${key} must be between 1 and ${maximum}` });
        }
      }
    }
  }

  if (seedEvidence !== undefined && !Array.isArray(seedEvidence)) {
    issues.push({ path: "seedEvidence", message: "seedEvidence must be an array" });
  } else if (Array.isArray(seedEvidence)) {
    uniqueIds(seedEvidence, "seedEvidence", issues);
    seedEvidence.forEach((record, index) => {
      const path = `seedEvidence.${index}`;
      if (!object(record)) return issues.push({ path, message: "evidence must be an object" });
      for (const key of ["id", "source", "operation", "backend", "retrievedAt", "verification"] as const) {
        if (!nonEmpty(record[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
      }
      if (nonEmpty(record["retrievedAt"]) && !validDate(record["retrievedAt"])) issues.push({ path: `${path}.retrievedAt`, message: "retrievedAt must be an ISO date" });
    });
  }

  if (seedDocuments !== undefined && !Array.isArray(seedDocuments)) {
    issues.push({ path: "seedDocuments", message: "seedDocuments must be an array" });
  } else if (Array.isArray(seedDocuments)) {
    uniqueIds(seedDocuments, "seedDocuments", issues);
    seedDocuments.forEach((document, index) => {
      const path = `seedDocuments.${index}`;
      if (!object(document)) return issues.push({ path, message: "seed document must be an object" });
      for (const key of ["id", "source", "sourceOperation", "title", "content", "retrievedAt"] as const) {
        if (!nonEmpty(document[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
      }
      if (!SOURCE_ROLES.has(String(document["sourceRole"]))) issues.push({ path: `${path}.sourceRole`, message: "sourceRole is invalid" });
      requiredStringArray(document, "subjectIds", path, issues);
      requiredStringArray(document, "investigationIds", path, issues);
      requiredStringArray(document, "evidenceIds", path, issues);
      if (nonEmpty(document["retrievedAt"]) && !validDate(document["retrievedAt"])) issues.push({ path: `${path}.retrievedAt`, message: "retrievedAt must be an ISO date" });
      if (document["publishedAt"] !== undefined && !validDate(document["publishedAt"])) issues.push({ path: `${path}.publishedAt`, message: "publishedAt must be an ISO date" });
    });
  }

  const subjectIds = new Set(Array.isArray(subjects) ? subjects.flatMap((item) => object(item) && nonEmpty(item["id"]) ? [item["id"]] : []) : []);
  const investigationIds = new Set(Array.isArray(investigations) ? investigations.flatMap((item) => object(item) && nonEmpty(item["id"]) ? [item["id"]] : []) : []);
  const evidenceIds = new Set(Array.isArray(seedEvidence) ? seedEvidence.flatMap((item) => object(item) && nonEmpty(item["id"]) ? [item["id"]] : []) : []);

  if (Array.isArray(subjects)) subjects.forEach((item, index) => {
    if (!object(item)) return;
    validateReferenceArray(item["evidenceIds"], evidenceIds, `subjects.${index}.evidenceIds`, "evidence", issues);
    if (Array.isArray(item["relations"])) item["relations"].forEach((relation, relationIndex) => {
      if (!object(relation)) return;
      if (nonEmpty(relation["targetSubjectId"]) && !subjectIds.has(relation["targetSubjectId"])) issues.push({ path: `subjects.${index}.relations.${relationIndex}.targetSubjectId`, message: `unknown subject '${relation["targetSubjectId"]}'` });
      validateReferenceArray(relation["evidenceIds"], evidenceIds, `subjects.${index}.relations.${relationIndex}.evidenceIds`, "evidence", issues);
    });
  });
  if (Array.isArray(investigations)) investigations.forEach((item, index) => {
    if (object(item)) validateReferenceArray(item["subjectIds"], subjectIds, `investigations.${index}.subjectIds`, "subject", issues);
  });
  if (Array.isArray(queries)) queries.forEach((item, index) => {
    if (!object(item)) return;
    if (nonEmpty(item["investigationId"]) && !investigationIds.has(item["investigationId"])) issues.push({ path: `sourceQueries.${index}.investigationId`, message: `unknown investigation '${item["investigationId"]}'` });
    validateReferenceArray(item["subjectIds"], subjectIds, `sourceQueries.${index}.subjectIds`, "subject", issues);
  });
  if (Array.isArray(seedDocuments)) seedDocuments.forEach((item, index) => {
    if (!object(item)) return;
    validateReferenceArray(item["subjectIds"], subjectIds, `seedDocuments.${index}.subjectIds`, "subject", issues);
    validateReferenceArray(item["investigationIds"], investigationIds, `seedDocuments.${index}.investigationIds`, "investigation", issues);
    validateReferenceArray(item["evidenceIds"], evidenceIds, `seedDocuments.${index}.evidenceIds`, "evidence", issues);
  });

  return issues.length === 0 ? { ok: true, value: input as unknown as DecisionContextBrief, issues } : { ok: false, issues };
}

export function validateDecisionContextAssessment(input: unknown): DecisionValidationResult<DecisionContextAssessmentInput> {
  const issues: DecisionValidationIssue[] = [];
  if (!object(input)) return { ok: false, issues: [{ path: "", message: "assessment must be an object" }] };
  for (const key of ["events", "ownerSignals", "conflicts", "unknowns"] as const) {
    if (!Array.isArray(input[key])) issues.push({ path: key, message: `${key} must be an array` });
  }
  const events = Array.isArray(input["events"]) ? input["events"] : [];
  const ownerSignals = Array.isArray(input["ownerSignals"]) ? input["ownerSignals"] : [];
  const conflicts = Array.isArray(input["conflicts"]) ? input["conflicts"] : [];
  const unknowns = Array.isArray(input["unknowns"]) ? input["unknowns"] : [];
  uniqueIds(events, "events", issues);
  uniqueIds(ownerSignals, "ownerSignals", issues);
  uniqueIds(conflicts, "conflicts", issues);
  uniqueIds(unknowns, "unknowns", issues);

  events.forEach((event, index) => {
    const path = `events.${index}`;
    if (!object(event)) return issues.push({ path, message: "event must be an object" });
    for (const key of ["id", "title", "category", "summary", "applicabilityBasis"] as const) {
      if (!nonEmpty(event[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
    }
    if (!VERIFICATIONS.has(String(event["verification"]))) issues.push({ path: `${path}.verification`, message: "verification is invalid" });
    if (!APPLICABILITIES.has(String(event["applicability"]))) issues.push({ path: `${path}.applicability`, message: "applicability is invalid" });
    if (!SEVERITIES.has(String(event["severity"]))) issues.push({ path: `${path}.severity`, message: "severity is invalid" });
    if (!REMEDIATIONS.has(String(event["remediation"]))) issues.push({ path: `${path}.remediation`, message: "remediation is invalid" });
    for (const key of ["subjectIds", "documentIds", "evidenceIds"] as const) requiredStringArray(event, key, path, issues);
    if (event["occurredAt"] !== undefined && !validDate(event["occurredAt"])) issues.push({ path: `${path}.occurredAt`, message: "occurredAt must be an ISO date" });
  });

  ownerSignals.forEach((signal, index) => {
    const path = `ownerSignals.${index}`;
    if (!object(signal)) return issues.push({ path, message: "owner signal must be an object" });
    for (const key of ["id", "topic", "summary"] as const) if (!nonEmpty(signal[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
    if (!POLARITIES.has(String(signal["polarity"]))) issues.push({ path: `${path}.polarity`, message: "polarity is invalid" });
    if (!RECURRENCES.has(String(signal["recurrence"]))) issues.push({ path: `${path}.recurrence`, message: "recurrence is invalid" });
    for (const key of ["subjectIds", "documentIds", "evidenceIds"] as const) requiredStringArray(signal, key, path, issues);
  });

  conflicts.forEach((conflict, index) => {
    const path = `conflicts.${index}`;
    if (!object(conflict)) return issues.push({ path, message: "conflict must be an object" });
    for (const key of ["id", "title", "summary"] as const) if (!nonEmpty(conflict[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
    for (const key of ["subjectIds", "documentIds", "evidenceIds"] as const) requiredStringArray(conflict, key, path, issues);
  });

  unknowns.forEach((unknown, index) => {
    const path = `unknowns.${index}`;
    if (!object(unknown)) return issues.push({ path, message: "unknown must be an object" });
    for (const key of ["id", "question"] as const) if (!nonEmpty(unknown[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
    for (const key of ["subjectIds", "documentIds", "evidenceIds"] as const) requiredStringArray(unknown, key, path, issues);
  });

  return issues.length === 0 ? { ok: true, value: input as unknown as DecisionContextAssessmentInput, issues } : { ok: false, issues };
}

export function validateDecisionEvidenceCorpus(input: unknown): DecisionValidationResult<DecisionEvidenceCorpus> {
  const issues: DecisionValidationIssue[] = [];
  if (!object(input)) return { ok: false, issues: [{ path: "", message: "corpus must be an object" }] };
  const briefValidation = validateDecisionContextBrief(input["brief"]);
  issues.push(...briefValidation.issues.map((issue) => ({ path: `brief${issue.path ? `.${issue.path}` : ""}`, message: issue.message })));
  const documents = input["documents"];
  const evidence = input["evidence"];
  const queries = input["queries"];
  if (!Array.isArray(documents)) issues.push({ path: "documents", message: "documents must be an array" });
  if (!Array.isArray(evidence)) issues.push({ path: "evidence", message: "evidence must be an array" });
  if (!Array.isArray(queries)) issues.push({ path: "queries", message: "queries must be an array" });
  if (!validDate(input["generatedAt"])) issues.push({ path: "generatedAt", message: "generatedAt must be an ISO date" });
  if (!["success", "partial", "blocked", "failed"].includes(String(input["status"]))) issues.push({ path: "status", message: "status is invalid" });

  const documentRows = Array.isArray(documents) ? documents : [];
  const evidenceRows = Array.isArray(evidence) ? evidence : [];
  uniqueIds(documentRows, "documents", issues);
  uniqueIds(evidenceRows, "evidence", issues);
  const documentIds = new Set(documentRows.flatMap((item) => object(item) && nonEmpty(item["id"]) ? [item["id"]] : []));
  const evidenceIds = new Set(evidenceRows.flatMap((item) => object(item) && nonEmpty(item["id"]) ? [item["id"]] : []));
  const subjectIds = new Set(briefValidation.value?.subjects.map((subject) => subject.id) ?? []);
  const investigationIds = new Set(briefValidation.value?.investigations.map((investigation) => investigation.id) ?? []);

  documentRows.forEach((document, index) => {
    const path = `documents.${index}`;
    if (!object(document)) return issues.push({ path, message: "document must be an object" });
    for (const key of ["id", "source", "sourceOperation", "title", "retrievedAt", "contentHash"] as const) {
      if (!nonEmpty(document[key])) issues.push({ path: `${path}.${key}`, message: `${key} is required` });
    }
    for (const key of ["content", "summary"] as const) {
      if (typeof document[key] !== "string") issues.push({ path: `${path}.${key}`, message: `${key} must be a string` });
    }
    if (!SOURCE_ROLES.has(String(document["sourceRole"]))) issues.push({ path: `${path}.sourceRole`, message: "sourceRole is invalid" });
    const expectedRole = expectedKnownSourceRole(document["source"], document["sourceOperation"]);
    if (expectedRole && document["sourceRole"] !== expectedRole) {
      issues.push({ path: `${path}.sourceRole`, message: `${String(document["source"])}.${String(document["sourceOperation"])} must use sourceRole '${expectedRole}'` });
    }
    if (!["seed", "discovery", "detail", "comment"].includes(String(document["stage"]))) issues.push({ path: `${path}.stage`, message: "stage is invalid" });
    requiredStringArray(document, "subjectIds", path, issues);
    requiredStringArray(document, "investigationIds", path, issues);
    requiredStringArray(document, "evidenceIds", path, issues);
    validateReferenceArray(document["subjectIds"], subjectIds, `${path}.subjectIds`, "subject", issues);
    validateReferenceArray(document["investigationIds"], investigationIds, `${path}.investigationIds`, "investigation", issues);
    validateReferenceArray(document["evidenceIds"], evidenceIds, `${path}.evidenceIds`, "evidence", issues);
    if (nonEmpty(document["retrievedAt"]) && !validDate(document["retrievedAt"])) issues.push({ path: `${path}.retrievedAt`, message: "retrievedAt must be an ISO date" });
    if (document["publishedAt"] !== undefined && !validDate(document["publishedAt"])) issues.push({ path: `${path}.publishedAt`, message: "publishedAt must be an ISO date" });
  });

  if (Array.isArray(queries)) queries.forEach((query, index) => {
    const path = `queries.${index}`;
    if (!object(query)) return issues.push({ path, message: "query record must be an object" });
    if (!nonEmpty(query["queryId"])) issues.push({ path: `${path}.queryId`, message: "queryId is required" });
    if (!Array.isArray(query["documentIds"])) issues.push({ path: `${path}.documentIds`, message: "documentIds must be an array" });
    validateReferenceArray(query["documentIds"], documentIds, `${path}.documentIds`, "document", issues);
  });

  return issues.length === 0 ? { ok: true, value: input as unknown as DecisionEvidenceCorpus, issues } : { ok: false, issues };
}
