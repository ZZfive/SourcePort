import { describe, expect, it } from "vitest";

import { validateDecisionContextBrief } from "@sourceport/decision-context";

import type { CarCandidate, CarResearchReport } from "./contracts.js";
import { buildCarDecisionContextBrief } from "./context.js";

const generatedAt = "2026-07-26T00:00:00.000Z";

function candidate(index: number, eligibility: CarCandidate["eligibility"] = "needs-verification"): CarCandidate {
  const suffix = String(index);
  return {
    candidateId: `dongchedi:${suffix}:trim:${suffix}0`,
    eligibility,
    series: {
      name: `车型${suffix}`,
      brand: "共享品牌",
      dongchediSeriesId: suffix,
      sourceUrls: [`https://www.dongchedi.com/auto/series/${suffix}`],
    },
    trim: {
      trimId: `${suffix}0`,
      name: `车型${suffix} 精确款`,
      year: "2026",
      officialPrice: "",
      dealerPrice: "",
      ownerPrice: "",
      sourceUrl: `https://www.dongchedi.com/model-${suffix}0`,
      configurationUrl: `https://www.dongchedi.com/params-${suffix}0`,
    },
    crossSource: { status: "matched", message: "fixture", evidenceIds: [`base-${suffix}`] },
    ownerReviews: [{
      reviewId: `review-${suffix}`,
      userDisplayName: `owner-${suffix}`,
      excerpt: `owner experience ${suffix}`,
      sourceUrl: `https://www.dongchedi.com/ugc/article/review-${suffix}`,
    }],
    configuration: index === 1
      ? [{ key: "battery_supplier", label: "动力电池供应商", value: "中创新航", options: [] }]
      : [],
    drivingAssistance: index === 1 ? { system: { vendor: "辅助驾驶供应商", name: "System", version: "1" } } : null,
    onRoadCost: { status: "unknown", components: [], missingComponents: [], reasons: [], evidenceIds: [] },
    criterionResults: [],
    sourceRatings: {},
    evidenceCompleteness: 0,
    evidenceIds: [`base-${suffix}`, `owner-${suffix}`, `configuration-${suffix}`],
  };
}

function report(): CarResearchReport {
  const candidates = Array.from({ length: 6 }, (_, index) => candidate(index + 1));
  const evidence = candidates.flatMap((_item, index) => {
    const suffix = String(index + 1);
    return [
      { id: `base-${suffix}`, source: "dongchedi", operation: "get-series", backend: "fixture", retrievedAt: generatedAt, verification: "source-verified" as const },
      { id: `owner-${suffix}`, source: "dongchedi", operation: "get-owner-reviews", backend: "fixture", retrievedAt: generatedAt, verification: "source-verified" as const },
      { id: `configuration-${suffix}`, source: "dongchedi", operation: "get-trim-configuration", backend: "fixture", retrievedAt: generatedAt, verification: "source-verified" as const },
    ];
  });
  return {
    status: "partial",
    query: "bounded candidates",
    market: { country: "CN", city: "武汉", currency: "CNY" },
    generatedAt,
    coverage: {
      mode: "bounded",
      limits: { initialSeeds: 8, expandedSeries: 12, scannedSeries: 8, exactConfigurations: 6, finalCandidates: 5, ownerReviewsPerSeries: 5 },
      attemptedSeeds: 6,
      validatedSeeds: 6,
      expandedSeries: 6,
      scannedSeries: 6,
      configuredTrims: 6,
      limitations: [],
    },
    candidates,
    rejected: [candidate(99, "rejected")],
    unsupportedCriteria: [],
    warnings: [],
    recoveryActions: [],
    evidence,
  };
}

describe("buildCarDecisionContextBrief", () => {
  it("uses at most five final candidates, shares manufacturer queries, and only adds evidenced suppliers", () => {
    const sourceReport = report();
    const eligibilityBefore = sourceReport.candidates.map((item) => item.eligibility);
    const brief = buildCarDecisionContextBrief(sourceReport);
    const validation = validateDecisionContextBrief(brief);

    expect(validation.issues).toEqual([]);
    expect(brief.subjects.filter((subject) => subject.kind === "car-series")).toHaveLength(5);
    expect(brief.subjects.filter((subject) => subject.kind === "car-trim")).toHaveLength(5);
    expect(brief.subjects.filter((subject) => subject.kind === "manufacturer")).toHaveLength(1);
    expect(brief.subjects.filter((subject) => subject.kind.includes("supplier"))).toHaveLength(2);
    expect(brief.seedDocuments).toHaveLength(5);
    expect(brief.sourceQueries.length).toBeLessThanOrEqual(24);
    expect(brief.sourceQueries.filter((query) => query.source === "36kr" && String((query.parameters as { query: string }).query).includes("共享品牌 召回"))).toHaveLength(1);
    for (const query of brief.sourceQueries.filter((item) => String((item.parameters as { query?: string }).query).includes("中创新航"))) {
      expect(String((query.parameters as { query: string }).query)).toContain("共享品牌 车型1 中创新航");
    }
    expect(sourceReport.candidates.map((item) => item.eligibility)).toEqual(eligibilityBefore);
    expect(brief.query).not.toContain("车型99");
    expect(() => buildCarDecisionContextBrief(sourceReport, { limits: { sourceQueries: 25 } }))
      .toThrow("generated DecisionContextBrief is invalid");
  });
});
