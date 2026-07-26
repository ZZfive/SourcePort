import { createHash, randomUUID } from "node:crypto";

import type {
  EvidenceRecord,
  RecoveryAction,
  SourceResult,
  SourceWarning,
} from "@sourceport/core";

import {
  resolvedDecisionContextLimits,
  type DecisionContextBrief,
  type DecisionContextDependencies,
  type DecisionDocument,
  type DecisionDocumentStage,
  type DecisionEvidenceCorpus,
  type DecisionQueryRecord,
  type DecisionSourceQuery,
  type DecisionSourceRole,
  type SeedDecisionDocument,
} from "./contracts.js";
import { validateDecisionContextBrief } from "./validate.js";

function canonicalText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function hash(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function canonicalUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    url.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "spm", "from"].forEach((key) => url.searchParams.delete(key));
    return url.toString();
  } catch {
    return value.trim() || undefined;
  }
}

function documentId(input: { url?: string; source: string; sourceItemId?: string; content: string }): string {
  return hash(input.sourceItemId
    ? `${input.source}:${input.sourceItemId}`
    : canonicalUrl(input.url) ?? `${input.source}:${hash(input.content)}`);
}

function roleRank(role: DecisionSourceRole): number {
  return {
    "official-primary": 6,
    "company-primary": 5,
    "owner-platform": 4,
    "media-secondary": 3,
    community: 2,
    discovery: 1,
  }[role];
}

function stageRank(stage: DecisionDocumentStage): number {
  return { seed: 2, discovery: 1, detail: 3, comment: 3 }[stage];
}

interface RawDocument {
  source: string;
  sourceOperation: string;
  sourceRole: DecisionSourceRole;
  stage: DecisionDocumentStage;
  subjectIds: string[];
  investigationIds: string[];
  title: string;
  content: string;
  summary?: string;
  url?: string;
  sourceItemId?: string;
  author?: string;
  publishedAt?: string;
  retrievedAt: string;
  evidenceIds: string[];
}

function normalizedDocument(input: RawDocument): DecisionDocument {
  const content = canonicalText(input.content);
  const title = canonicalText(input.title) || "Untitled document";
  const url = canonicalUrl(input.url);
  return {
    id: documentId({
      ...(url ? { url } : {}),
      source: input.source,
      ...(input.sourceItemId ? { sourceItemId: input.sourceItemId } : {}),
      content,
    }),
    source: input.source,
    sourceOperation: input.sourceOperation,
    sourceRole: input.sourceRole,
    stage: input.stage,
    subjectIds: [...new Set(input.subjectIds)],
    investigationIds: [...new Set(input.investigationIds)],
    title,
    content,
    summary: canonicalText(input.summary ?? content.slice(0, 500)),
    ...(url ? { url } : {}),
    ...(input.sourceItemId ? { sourceItemId: input.sourceItemId } : {}),
    ...(input.author ? { author: canonicalText(input.author) } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    retrievedAt: input.retrievedAt,
    contentHash: hash(content),
    evidenceIds: [...new Set(input.evidenceIds)],
  };
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function requestedDocumentLimit(query: DecisionSourceQuery, fallback: number): number {
  if (!query.parameters || typeof query.parameters !== "object" || Array.isArray(query.parameters)) return fallback;
  const requested = Number((query.parameters as Record<string, unknown>)["limit"]);
  return Number.isInteger(requested) && requested > 0 ? Math.min(requested, fallback) : fallback;
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resultDocuments(
  query: Pick<DecisionSourceQuery, "source" | "operation" | "subjectIds" | "investigationId" | "sourceRole">,
  result: SourceResult,
  limit: number,
  fallbackRetrievedAt: string,
): DecisionDocument[] {
  const data = result.data as Record<string, unknown> | undefined;
  if (!data) return [];
  const base = {
    source: query.source,
    sourceOperation: query.operation,
    subjectIds: query.subjectIds,
    investigationIds: [query.investigationId],
    retrievedAt: result.retrievedAt ?? fallbackRetrievedAt,
    evidenceIds: result.evidence.map((item) => item.id),
  };
  const output: RawDocument[] = [];
  if (query.source === "brave-search" && query.operation === "search") {
    for (const item of records(data["items"]).slice(0, limit)) output.push({
      ...base, sourceRole: "discovery", stage: "discovery",
      title: string(item["title"]), content: string(item["snippet"]), summary: string(item["snippet"]),
      url: string(item["url"]),
      ...(string(item["publishedAt"]) ? { publishedAt: string(item["publishedAt"]) } : {}),
    });
  } else if (query.source === "samr" && query.operation === "search-notices") {
    for (const item of records(data["items"]).slice(0, limit)) output.push({
      ...base, sourceRole: "discovery", stage: "discovery",
      title: string(item["title"]), content: string(item["summary"]), summary: string(item["summary"]),
      url: string(item["url"]), sourceItemId: string(item["noticeId"]),
      ...(string(item["publishedAt"]) ? { publishedAt: string(item["publishedAt"]) } : {}),
    });
  } else if (query.source === "samr" && query.operation === "get-notice") {
    output.push({
      ...base, sourceRole: "official-primary", stage: "detail",
      title: string(data["title"]), content: string(data["body"]), url: string(data["url"]),
      sourceItemId: string(data["noticeId"]),
      ...(string(data["publishedAt"]) ? { publishedAt: string(data["publishedAt"]) } : {}),
      author: string(data["department"]),
    });
  } else if (query.source === "36kr" && query.operation === "search-articles") {
    for (const item of records(data["items"]).slice(0, limit)) output.push({
      ...base, sourceRole: "discovery", stage: "discovery",
      title: string(item["title"]), content: "", url: string(item["url"]),
      ...(string(item["publishedAt"]) ? { publishedAt: string(item["publishedAt"]) } : {}),
    });
  } else if (query.source === "36kr" && query.operation === "get-article") {
    output.push({
      ...base, sourceRole: "media-secondary", stage: "detail",
      title: string(data["title"]), content: string(data["body"]), url: string(data["url"]),
      sourceItemId: string(data["articleId"]), author: string(data["author"]),
      ...(string(data["publishedAt"]) ? { publishedAt: string(data["publishedAt"]) } : {}),
    });
  } else if (query.source === "xiaohongshu" && query.operation === "search-notes") {
    for (const item of records(data["items"]).slice(0, limit)) output.push({
      ...base, sourceRole: "discovery", stage: "discovery",
      title: string(item["title"]), content: "", url: string(item["url"]),
      sourceItemId: string(item["noteId"]), author: string(item["author"]),
      ...(string(item["publishedAt"]) ? { publishedAt: string(item["publishedAt"]) } : {}),
    });
  } else if (query.source === "xiaohongshu" && query.operation === "get-note") {
    output.push({
      ...base, sourceRole: "community", stage: "detail",
      title: string(data["title"]), content: string(data["content"]), url: string(data["url"]),
      sourceItemId: string(data["noteId"]), author: string(data["author"]),
    });
  } else if (query.source === "xiaohongshu" && query.operation === "get-comments") {
    const url = string(data["url"]);
    const noteId = string(data["noteId"]);
    for (const item of records(data["items"]).slice(0, limit)) {
      const rank = Number(item["rank"]) || output.length + 1;
      const content = string(item["text"]);
      output.push({
        ...base, sourceRole: "community", stage: "comment",
        title: `Comment on ${noteId}`, content, url,
        sourceItemId: `${noteId}:comment:${rank}:${hash(content)}`,
        author: string(item["author"]),
        ...(string(item["publishedAt"]) ? { publishedAt: string(item["publishedAt"]) } : {}),
      });
    }
  }
  return output.filter((item) => item.title || item.content).map(normalizedDocument);
}

function seedDocument(input: SeedDecisionDocument): DecisionDocument {
  return normalizedDocument({ ...input, stage: "seed", summary: input.content.slice(0, 500) });
}

function queryStatus(result: SourceResult): DecisionQueryRecord["status"] {
  if (result.status === "success") return "success";
  if (result.status === "partial" || result.status === "stale") return "partial";
  return result.status;
}

function detailQueries(query: DecisionSourceQuery, documents: DecisionDocument[], commentsPerNote: number): DecisionSourceQuery[] {
  const output: DecisionSourceQuery[] = [];
  documents.forEach((document, index) => {
    if (!document.url) return [];
    if (query.source === "samr" && query.operation === "search-notices") output.push({
      id: `${query.id}:detail:${index}`,
      investigationId: query.investigationId,
      subjectIds: query.subjectIds,
      source: "samr",
      operation: "get-notice",
      parameters: { url: document.url },
      sourceRole: "official-primary",
    });
    if (query.source === "36kr" && query.operation === "search-articles") output.push({
      id: `${query.id}:detail:${index}`,
      investigationId: query.investigationId,
      subjectIds: query.subjectIds,
      source: "36kr",
      operation: "get-article",
      parameters: { id: document.url },
      sourceRole: "media-secondary",
    });
    if (query.source === "xiaohongshu" && query.operation === "search-notes") output.push(
      {
        id: `${query.id}:detail:${index}`,
        investigationId: query.investigationId,
        subjectIds: query.subjectIds,
        source: "xiaohongshu",
        operation: "get-note",
        parameters: { note: document.url },
        sourceRole: "community",
      },
      {
        id: `${query.id}:comments:${index}`,
        investigationId: query.investigationId,
        subjectIds: query.subjectIds,
        source: "xiaohongshu",
        operation: "get-comments",
        parameters: { note: document.url, limit: commentsPerNote },
        sourceRole: "community",
      },
    );
  });
  return output;
}

function withinWindow(document: DecisionDocument, brief: DecisionContextBrief, investigationId: string): boolean {
  if (!document.publishedAt) return true;
  const investigation = brief.investigations.find((item) => item.id === investigationId);
  if (!investigation) return true;
  const timestamp = Date.parse(document.publishedAt);
  const from = Date.parse(investigation.window.from);
  const to = investigation.window.to ? Date.parse(investigation.window.to) : Number.POSITIVE_INFINITY;
  return timestamp >= from && timestamp <= to;
}

function warningKey(warning: SourceWarning): string {
  return `${warning.code}:${warning.field ?? ""}:${warning.message}`;
}

function recoveryKey(action: RecoveryAction): string {
  return `${action.kind}:${action.backend ?? ""}:${action.description}`;
}

export async function collectDecisionContext(
  input: unknown,
  dependencies: DecisionContextDependencies,
): Promise<DecisionEvidenceCorpus> {
  const validation = validateDecisionContextBrief(input);
  const now = dependencies.now ?? (() => new Date());
  if (!validation.ok || !validation.value) {
    return {
      status: "failed",
      generatedAt: now().toISOString(),
      brief: {
        domain: "",
        query: "",
        subjects: [],
        investigations: [],
        sourceQueries: [],
      },
      documents: [],
      queries: [],
      evidence: [],
      warnings: validation.issues.map((issue) => ({ code: "invalid_brief", message: issue.message, field: issue.path })),
      recoveryActions: [],
      coverage: {
        attemptedQueries: 0,
        successfulQueries: 0,
        blockedQueries: 0,
        failedQueries: 0,
        detailCalls: 0,
        documents: 0,
        bySource: {},
        limitations: ["collection did not start because the brief was invalid"],
      },
    };
  }
  const brief = validation.value;
  const limits = resolvedDecisionContextLimits(brief.limits);
  const documents = new Map<string, DecisionDocument>();
  const documentsByUrl = new Map<string, string>();
  const documentsBySourceItem = new Map<string, string>();
  const documentsByContentHash = new Map<string, string>();
  const evidence = new Map<string, EvidenceRecord>();
  const warnings = new Map<string, SourceWarning>();
  const recoveryActions = new Map<string, RecoveryAction>();
  const queries: DecisionQueryRecord[] = [];
  const limitations: string[] = [];
  const subjectCounts = new Map<string, number>();
  const executedDetails = new Set<string>();
  let detailCalls = 0;

  const addDocument = (document: DecisionDocument): string | undefined => {
    const urlKey = document.stage !== "comment" && document.url ? canonicalUrl(document.url) : undefined;
    const sourceItemKey = document.sourceItemId
      ? `${document.source}:${document.sourceItemId}`
      : undefined;
    const contentKey = document.content ? document.contentHash : undefined;
    const existingId = documents.has(document.id)
      ? document.id
      : urlKey && documentsByUrl.get(urlKey)
        ? documentsByUrl.get(urlKey)
        : sourceItemKey && documentsBySourceItem.get(sourceItemKey)
          ? documentsBySourceItem.get(sourceItemKey)
          : contentKey && documentsByContentHash.get(contentKey);
    const existing = existingId ? documents.get(existingId) : undefined;
    if (!existing) {
      if (documents.size >= limits.totalDocuments) {
        if (!limitations.includes("total document limit reached")) limitations.push("total document limit reached");
        return undefined;
      }
      const allowedSubjects = document.subjectIds.filter((subjectId) => (subjectCounts.get(subjectId) ?? 0) < limits.perSubjectDocuments);
      if (allowedSubjects.length === 0) {
        if (!limitations.includes("per-subject document limit reached")) limitations.push("per-subject document limit reached");
        return undefined;
      }
      document.subjectIds = allowedSubjects;
      documents.set(document.id, document);
      if (urlKey) documentsByUrl.set(urlKey, document.id);
      if (sourceItemKey) documentsBySourceItem.set(sourceItemKey, document.id);
      if (contentKey) documentsByContentHash.set(contentKey, document.id);
      allowedSubjects.forEach((subjectId) => subjectCounts.set(subjectId, (subjectCounts.get(subjectId) ?? 0) + 1));
      return document.id;
    }
    const newSubjects = document.subjectIds.filter((subjectId) =>
      !existing.subjectIds.includes(subjectId) && (subjectCounts.get(subjectId) ?? 0) < limits.perSubjectDocuments);
    existing.subjectIds = [...existing.subjectIds, ...newSubjects];
    newSubjects.forEach((subjectId) => subjectCounts.set(subjectId, (subjectCounts.get(subjectId) ?? 0) + 1));
    existing.investigationIds = [...new Set([...existing.investigationIds, ...document.investigationIds])];
    existing.evidenceIds = [...new Set([...existing.evidenceIds, ...document.evidenceIds])];
    if (stageRank(document.stage) > stageRank(existing.stage) || document.content.length > existing.content.length) {
      existing.stage = document.stage;
      existing.title = document.title;
      existing.content = document.content;
      existing.summary = document.summary;
      existing.contentHash = document.contentHash;
      existing.sourceOperation = document.sourceOperation;
      existing.source = document.source;
    }
    if (roleRank(document.sourceRole) > roleRank(existing.sourceRole)) existing.sourceRole = document.sourceRole;
    if (!existing.publishedAt && document.publishedAt) existing.publishedAt = document.publishedAt;
    if (!existing.author && document.author) existing.author = document.author;
    if (!existing.sourceItemId && document.sourceItemId) existing.sourceItemId = document.sourceItemId;
    return existing.id;
  };

  for (const record of brief.seedEvidence ?? []) evidence.set(record.id, record);
  for (const seed of brief.seedDocuments ?? []) addDocument(seedDocument(seed));

  const run = async (query: DecisionSourceQuery, detail: boolean): Promise<DecisionDocument[]> => {
    let result: SourceResult;
    try {
      result = await dependencies.execute({
        requestId: randomUUID(),
        source: query.source,
        operation: query.operation,
        parameters: query.parameters,
        ...(brief.freshness ? { freshness: brief.freshness } : {}),
        ...(brief.execution ? { execution: brief.execution } : {}),
      });
    } catch (error) {
      result = {
        requestId: randomUUID(),
        source: query.source,
        operation: query.operation,
        operationSchemaVersion: "unknown",
        status: "failed",
        evidence: [],
        warnings: [],
        failure: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "source executor failed",
          stage: "transport",
          retryable: false,
        },
        recoveryActions: [],
      };
    }
    result.evidence.forEach((record) => evidence.set(record.id, record));
    result.warnings.forEach((warning) => warnings.set(warningKey(warning), warning));
    result.recoveryActions.forEach((action) => recoveryActions.set(recoveryKey(action), action));
    if (result.failure) warnings.set(`${query.id}:${result.failure.code}`, {
      code: `source_${result.failure.code}`,
      message: `${query.source}.${query.operation}: ${result.failure.message}`,
    });
    if (result.status === "blocked" || result.status === "failed") {
      const limitation = `${query.source}.${query.operation} did not provide documents (${result.failure?.code ?? result.status})`;
      if (!limitations.includes(limitation)) limitations.push(limitation);
    }
    const normalized = resultDocuments(
      query,
      result,
      detail && query.operation === "get-comments"
        ? requestedDocumentLimit(query, limits.commentsPerNote)
        : requestedDocumentLimit(query, limits.perQueryDocuments),
      now().toISOString(),
    ).filter((document) => withinWindow(document, brief, query.investigationId));
    if (normalized.some((document) => !document.publishedAt) && !limitations.includes("some documents have unknown publication dates")) {
      limitations.push("some documents have unknown publication dates");
    }
    const documentIds = normalized.flatMap((document) => {
      const id = addDocument(document);
      return id ? [id] : [];
    });
    queries.push({
      queryId: query.id,
      source: query.source,
      operation: query.operation,
      status: queryStatus(result),
      documentIds: [...new Set(documentIds)],
      ...(result.failure ? { failureCode: result.failure.code } : {}),
    });
    return normalized;
  };

  for (const query of brief.sourceQueries.slice(0, limits.sourceQueries)) {
    const discovered = await run(query, false);
    for (const detailQuery of detailQueries(query, discovered, limits.commentsPerNote)) {
      if (detailCalls >= limits.detailDocuments) break;
      const detailKey = `${detailQuery.source}:${detailQuery.operation}:${JSON.stringify(detailQuery.parameters)}`;
      if (executedDetails.has(detailKey)) continue;
      executedDetails.add(detailKey);
      detailCalls += 1;
      await run(detailQuery, true);
    }
  }

  const successfulQueries = queries.filter((item) => item.status === "success").length;
  const blockedQueries = queries.filter((item) => item.status === "blocked").length;
  const failedQueries = queries.filter((item) => item.status === "failed").length;
  const partialQueries = queries.filter((item) => item.status === "partial").length;
  const bySource: Record<string, number> = Object.fromEntries(
    [...new Set(brief.sourceQueries.map((query) => query.source))].map((source) => [source, 0]),
  );
  for (const document of documents.values()) bySource[document.source] = (bySource[document.source] ?? 0) + 1;
  const requiredQueryIds = new Set(
    brief.sourceQueries.filter((query) => query.required).map((query) => query.id),
  );
  const requiredRecords = queries.filter((query) => requiredQueryIds.has(query.queryId));
  const allRequiredBlocked = requiredRecords.length > 0 &&
    requiredRecords.every((query) => query.status === "blocked");
  const acquiredDocuments = [...documents.values()].filter((document) => document.stage !== "seed");
  const allAcquisitionBlocked = queries.length > 0 && acquiredDocuments.length === 0 &&
    queries.every((query) => query.status === "blocked");
  const status = allRequiredBlocked || allAcquisitionBlocked
    ? "blocked"
    : documents.size === 0
      ? "failed"
      : blockedQueries > 0 || failedQueries > 0 || partialQueries > 0 ? "partial" : "success";
  return {
    status,
    generatedAt: now().toISOString(),
    brief,
    documents: [...documents.values()],
    queries,
    evidence: [...evidence.values()],
    warnings: [...warnings.values()],
    recoveryActions: [...recoveryActions.values()],
    coverage: {
      attemptedQueries: queries.length,
      successfulQueries,
      blockedQueries,
      failedQueries,
      detailCalls,
      documents: documents.size,
      bySource,
      limitations,
    },
  };
}

export const __test__ = { canonicalUrl, normalizedDocument, resultDocuments, detailQueries };
