import { describe, expect, it } from "vitest";
import { enrichCarResearchReport } from "./enrichment.js";
import type { CarResearchReport } from "./contracts.js";
const report = { candidates: [{ series: { name: "X", brand: "A" } }], rejected: [], warnings: [], recoveryActions: [], evidence: [], unsupportedCriteria: [], coverage: { mode: "bounded", limits: { initialSeeds: 1, expandedSeries: 1, scannedSeries: 1, exactConfigurations: 1, finalCandidates: 1, ownerReviewsPerSeries: 1 }, attemptedSeeds: 1, validatedSeeds: 1, expandedSeries: 1, scannedSeries: 1, configuredTrims: 1, limitations: [] }, status: "success", query: "q", market: { city: "示例城市" }, generatedAt: "2026-09-01T00:00:00Z" } as unknown as CarResearchReport;
describe("report enrichment", () => it("attaches matching feedback and freshness", () => { const result = enrichCarResearchReport(report, { now: new Date("2026-09-01T00:00:00Z"), snapshots: [{ id: "s", seriesId: "1", brand: "A", series: "X", capturedAt: "2026-09-01T00:00:00Z", validUntil: "2026-10-01T00:00:00Z", fields: {}, sourceEvidenceIds: ["e"] }], feedbackClusters: [{ id: "f", brand: "A", series: "X", modelYears: [], trimIds: [], topic: "battery", records: [], sourceCount: 1, signal: "watch", rationale: "repeat", evidenceIds: ["f1"] }] }); expect(result.freshness).toBe("fresh"); expect(result.feedbackClusters?.[0]?.signal).toBe("watch"); }));

describe("recommendation status", () => {
  it("pauses on official unresolved high severity feedback", () => {
    const result = enrichCarResearchReport(report, { feedbackClusters: [{ id: "f", brand: "A", series: "X", modelYears: [], trimIds: [], topic: "battery", records: [], sourceCount: 1, signal: "pause", rationale: "official risk", evidenceIds: ["risk-1"] }] });
    expect(result.recommendation).toEqual(expect.objectContaining({ status: "pause", evidenceIds: ["risk-1"] }));
  });
});
