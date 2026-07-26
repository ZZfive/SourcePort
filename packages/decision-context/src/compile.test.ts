import { describe, expect, it } from "vitest";

import { compileDecisionContext } from "./compile.js";
import type {
  DecisionContextAssessmentInput,
  DecisionDocument,
  DecisionEvidenceCorpus,
  DecisionSubject,
} from "./contracts.js";

const generatedAt = "2026-07-26T00:00:00.000Z";

function document(
  id: string,
  source: string,
  sourceRole: DecisionDocument["sourceRole"],
  subjectIds = ["car"],
  extras: Partial<DecisionDocument> = {},
): DecisionDocument {
  return {
    id,
    source,
    sourceOperation: "get",
    sourceRole,
    stage: "detail",
    subjectIds,
    investigationIds: ["risk"],
    title: id,
    content: `content ${id}`,
    summary: `summary ${id}`,
    retrievedAt: generatedAt,
    contentHash: `sha256:${id}`,
    evidenceIds: [`evidence:${id}`],
    ...extras,
  };
}

function corpus(documents: DecisionDocument[], subjects?: DecisionSubject[]): DecisionEvidenceCorpus {
  const evidence = documents.map((item) => ({
    id: item.evidenceIds[0]!,
    source: item.source,
    operation: item.sourceOperation,
    backend: "fixture",
    retrievedAt: generatedAt,
    verification: "source-verified" as const,
  }));
  const resolvedSubjects = subjects ?? [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }];
  return {
    status: "success",
    generatedAt,
    brief: {
      domain: "cars",
      query: "candidate context",
      subjects: resolvedSubjects,
      investigations: [{ id: "risk", label: "Risk", category: "risk", subjectIds: resolvedSubjects.map((item) => item.id), window: { from: "2025-01-01T00:00:00.000Z" } }],
      sourceQueries: [],
      seedEvidence: evidence,
    },
    documents,
    queries: [],
    evidence,
    warnings: [],
    recoveryActions: [],
    coverage: {
      attemptedQueries: 0,
      successfulQueries: 0,
      blockedQueries: 0,
      failedQueries: 0,
      detailCalls: 0,
      documents: documents.length,
      bySource: Object.fromEntries(documents.map((item) => [item.source, 1])),
      limitations: [],
    },
  };
}

function assessment(overrides: Partial<DecisionContextAssessmentInput> = {}): DecisionContextAssessmentInput {
  return { events: [], ownerSignals: [], conflicts: [], unknowns: [], ...overrides };
}

describe("compileDecisionContext", () => {
  it("derives pause only for direct unresolved severe official evidence and lowers completed remediation", () => {
    const official = document("official", "samr", "official-primary", ["car"], { publishedAt: "2026-07-01T00:00:00.000Z" });
    const baseEvent = {
      id: "recall",
      title: "Recall",
      category: "recall",
      summary: "Official recall",
      subjectIds: ["car"],
      documentIds: [official.id],
      evidenceIds: official.evidenceIds,
      verification: "confirmed" as const,
      applicability: "direct" as const,
      applicabilityBasis: "exact series is named",
      severity: "high" as const,
      remediation: "in-progress" as const,
      occurredAt: "2026-06-30T00:00:00.000Z",
    };
    const paused = compileDecisionContext(corpus([official]), assessment({ events: [baseEvent] }), () => new Date(generatedAt));
    expect(paused.ok).toBe(true);
    expect(paused.report?.events[0]?.decisionFlag).toBe("pause");

    const completed = compileDecisionContext(
      corpus([official]),
      assessment({ events: [{ ...baseEvent, remediation: "completed" }] }),
      () => new Date(generatedAt),
    );
    expect(completed.report?.events[0]?.decisionFlag).toBe("verify-before-buy");
  });

  it("rejects discovery-only confirmation", () => {
    const lead = document("lead", "brave-search", "discovery");
    const result = compileDecisionContext(corpus([lead]), assessment({ events: [{
      id: "lead-event",
      title: "Alleged event",
      category: "news",
      summary: "A search result alleges an event",
      subjectIds: ["car"],
      documentIds: [lead.id],
      evidenceIds: lead.evidenceIds,
      verification: "confirmed",
      applicability: "unknown",
      applicabilityBasis: "search result only",
      severity: "unknown",
      remediation: "unknown",
    }] }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("discovery-only"))).toBe(true);
  });

  it("does not allow a Brave document to be relabeled as an official source", () => {
    const mislabeled = document("lead", "brave-search", "official-primary", ["car"], { sourceOperation: "search" });
    const result = compileDecisionContext(corpus([mislabeled]), assessment());
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("must use sourceRole 'discovery'"))).toBe(true);
  });

  it("keeps an unconnected supplier event indirect and rejects direct applicability", () => {
    const supplierDocument = document("supplier-event", "36kr", "media-secondary", ["car", "supplier"]);
    const subjects: DecisionSubject[] = [
      { id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] },
      { id: "supplier", label: "Battery supplier", kind: "battery-supplier", evidenceIds: [] },
    ];
    const event = {
      id: "supplier-penalty",
      title: "Supplier penalty",
      category: "penalty",
      summary: "The supplier was penalized",
      subjectIds: ["car", "supplier"],
      documentIds: [supplierDocument.id],
      evidenceIds: supplierDocument.evidenceIds,
      verification: "single-source" as const,
      applicability: "indirect" as const,
      applicabilityBasis: "no exact model or batch relation is evidenced",
      severity: "medium" as const,
      remediation: "unknown" as const,
    };
    const indirect = compileDecisionContext(corpus([supplierDocument], subjects), assessment({ events: [event] }));
    expect(indirect.report?.events[0]?.decisionFlag).toBe("watch");
    const direct = compileDecisionContext(corpus([supplierDocument], subjects), assessment({ events: [{ ...event, applicability: "direct" }] }));
    expect(direct.ok).toBe(false);
    expect(direct.issues.some((issue) => issue.message.includes("supplier evidence"))).toBe(true);
  });

  it("enforces repeated and cross-source owner thresholds", () => {
    const ownerDocuments = [
      document("owner-1", "dongchedi", "owner-platform", ["car"], { author: "one" }),
      document("owner-2", "dongchedi", "owner-platform", ["car"], { author: "two" }),
      document("owner-3", "dongchedi", "owner-platform", ["car"], { author: "three" }),
      document("owner-4", "xiaohongshu", "community", ["car"], { author: "four" }),
    ];
    const signal = {
      id: "noise",
      topic: "Wind noise",
      summary: "Owners mention wind noise",
      polarity: "negative" as const,
      recurrence: "repeated" as const,
      subjectIds: ["car"],
      documentIds: ownerDocuments.slice(0, 2).map((item) => item.id),
      evidenceIds: ownerDocuments.slice(0, 2).flatMap((item) => item.evidenceIds),
    };
    const tooFew = compileDecisionContext(corpus(ownerDocuments), assessment({ ownerSignals: [signal] }));
    expect(tooFew.ok).toBe(false);

    const repeated = compileDecisionContext(corpus(ownerDocuments), assessment({ ownerSignals: [{
      ...signal,
      documentIds: ownerDocuments.slice(0, 3).map((item) => item.id),
      evidenceIds: ownerDocuments.slice(0, 3).flatMap((item) => item.evidenceIds),
    }] }));
    expect(repeated.ok).toBe(true);

    const crossSource = compileDecisionContext(corpus(ownerDocuments), assessment({ ownerSignals: [{
      ...signal,
      recurrence: "cross-source",
      documentIds: ownerDocuments.map((item) => item.id),
      evidenceIds: ownerDocuments.flatMap((item) => item.evidenceIds),
    }] }));
    expect(crossSource.ok).toBe(true);
    expect(crossSource.report?.ownerSignals[0]?.distinctSources).toBe(2);
  });

  it("requires independent source families for conflicts", () => {
    const left = document("left", "36kr", "media-secondary");
    const right = document("right", "samr", "official-primary");
    const conflict = {
      id: "scope-conflict",
      title: "Affected scope differs",
      summary: "The sources describe different batches",
      subjectIds: ["car"],
      documentIds: [left.id, right.id],
      evidenceIds: [...left.evidenceIds, ...right.evidenceIds],
    };
    const compiled = compileDecisionContext(corpus([left, right]), assessment({ conflicts: [conflict] }));
    expect(compiled.ok).toBe(true);
    expect(compiled.report?.status).toBe("partial");
  });

  it("rejects assessment references that are absent from the corpus", () => {
    const official = document("official", "samr", "official-primary");
    const result = compileDecisionContext(corpus([official]), assessment({ events: [{
      id: "invalid-reference",
      title: "Recall",
      category: "recall",
      summary: "Recall",
      subjectIds: ["car"],
      documentIds: ["missing-document"],
      evidenceIds: ["missing-evidence"],
      verification: "confirmed",
      applicability: "direct",
      applicabilityBasis: "exact series",
      severity: "high",
      remediation: "unknown",
    }] }));
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.message.includes("unknown document"))).toBe(true);
    expect(result.issues.some((issue) => issue.message.includes("unknown evidence"))).toBe(true);
  });
});
