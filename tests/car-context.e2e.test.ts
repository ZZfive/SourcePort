import { describe, expect, it } from "vitest";

import {
  buildCarDecisionContextBrief,
  type CarCandidate,
  type CarResearchReport,
} from "@sourceport/car-research";
import { collectDecisionContext } from "@sourceport/decision-context";
import type { SourceRequest, SourceResult } from "@sourceport/core";

const now = "2026-07-26T00:00:00.000Z";

function candidate(index: number): CarCandidate {
  return {
    candidateId: `candidate-${index}`,
    eligibility: "needs-verification",
    series: { name: `车型${index}`, brand: "同一制造商", sourceUrls: [] },
    trim: {
      trimId: `trim-${index}`,
      name: `精确款${index}`,
      year: "2026",
      officialPrice: "",
      dealerPrice: "",
      ownerPrice: "",
      sourceUrl: `https://dongchedi.example/trim-${index}`,
      configurationUrl: `https://dongchedi.example/config-${index}`,
    },
    crossSource: { status: "matched", message: "fixture", evidenceIds: [`base-${index}`] },
    ownerReviews: [{ reviewId: `review-${index}`, userDisplayName: `owner-${index}`, excerpt: `owner experience ${index}`, sourceUrl: `https://dongchedi.example/review-${index}` }],
    configuration: [],
    drivingAssistance: null,
    onRoadCost: { status: "unknown", components: [], missingComponents: [], reasons: [], evidenceIds: [] },
    criterionResults: [],
    sourceRatings: {},
    evidenceCompleteness: 0,
    evidenceIds: [`base-${index}`, `owner-${index}`, `configuration-${index}`],
  };
}

function report(): CarResearchReport {
  const candidates = [candidate(1), candidate(2)];
  return {
    status: "partial",
    query: "two candidates",
    market: { city: "武汉" },
    generatedAt: now,
    coverage: {
      mode: "bounded",
      limits: { initialSeeds: 2, expandedSeries: 2, scannedSeries: 2, exactConfigurations: 2, finalCandidates: 2, ownerReviewsPerSeries: 1 },
      attemptedSeeds: 2,
      validatedSeeds: 2,
      expandedSeries: 2,
      scannedSeries: 2,
      configuredTrims: 2,
      limitations: [],
    },
    candidates,
    rejected: [],
    unsupportedCriteria: [],
    warnings: [],
    recoveryActions: [],
    evidence: candidates.flatMap((_candidate, offset) => {
      const index = offset + 1;
      return [
        { id: `base-${index}`, source: "dongchedi", operation: "get-series", backend: "fixture", retrievedAt: now, verification: "source-verified" as const },
        { id: `owner-${index}`, source: "dongchedi", operation: "get-owner-reviews", backend: "fixture", retrievedAt: now, verification: "source-verified" as const },
        { id: `configuration-${index}`, source: "dongchedi", operation: "get-trim-configuration", backend: "fixture", retrievedAt: now, verification: "source-verified" as const },
      ];
    }),
  };
}

function result(request: SourceRequest, data: unknown): SourceResult {
  const discriminator = JSON.stringify(request.parameters);
  return {
    requestId: request.requestId ?? "fixture",
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: "1.0.0",
    status: "success",
    ...(data === undefined ? {} : { data }),
    backend: "fixture",
    retrievedAt: now,
    evidence: [{ id: `live:${request.source}:${request.operation}:${discriminator}`, source: request.source, operation: request.operation, backend: "fixture", retrievedAt: now, verification: "source-verified" }],
    warnings: [],
    recoveryActions: [],
  };
}

describe("car decision context integration", () => {
  it("keeps owner seeds and paper ordering when Xiaohongshu is blocked but Brave is usable", async () => {
    const carReport = report();
    const eligibility = carReport.candidates.map((item) => item.eligibility);
    const ordering = carReport.candidates.map((item) => item.candidateId);
    const brief = buildCarDecisionContextBrief(carReport);
    const corpus = await collectDecisionContext(brief, {
      now: () => new Date(now),
      execute: async (request) => {
        if (request.source === "xiaohongshu") return {
          ...result(request, undefined),
          status: "blocked",
          evidence: [],
          failure: { code: "auth_required", message: "login", stage: "transport", retryable: false },
          recoveryActions: [{ kind: "login", description: "log in", requiresUser: true }],
        };
        if (request.source === "brave-search") return result(request, { items: [{ title: "Lead", url: `https://example.com/${encodeURIComponent(JSON.stringify(request.parameters))}`, snippet: "discovery only" }] });
        return result(request, { items: [] });
      },
    });

    expect(corpus.status).toBe("partial");
    expect(corpus.documents.filter((document) => document.sourceRole === "owner-platform")).toHaveLength(2);
    expect(corpus.documents.some((document) => document.source === "brave-search")).toBe(true);
    expect(corpus.coverage.blockedQueries).toBe(2);
    expect(carReport.candidates.map((item) => item.eligibility)).toEqual(eligibility);
    expect(carReport.candidates.map((item) => item.candidateId)).toEqual(ordering);
  });
});
