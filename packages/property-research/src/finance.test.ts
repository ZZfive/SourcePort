import { describe, expect, it } from "vitest";
import { calculateAllInCost, calculateMonthlyPayment, calculateMortgageScenarios } from "./finance.js";

describe("property finance", () => {
  it("keeps missing all-in components explicit", () => {
    const result = calculateAllInCost({ purchasePrice: { minimumCny: 1_500_000, maximumCny: 1_500_000 }, costEvidence: [] });
    expect(result.status).toBe("estimate");
    expect(result.missingComponents).toContain("renovation");
    expect(result.estimateRange?.minimumCny).toBe(1_500_000);
  });

  it("calculates equal-principal-and-interest monthly payment", () => {
    expect(calculateMonthlyPayment({ principalCny: 1_000_000, annualRate: 0.03 / 12 * 12, months: 360 })).toBeCloseTo(4216.04, 1);
  });

  it("generates financing scenarios only from explicit inputs", () => {
    expect(calculateMortgageScenarios({ purchasePrice: { minimumCny: 1_000_000, maximumCny: 1_000_000 }, downPaymentRatios: [0.3], annualRates: [0.03], termsMonths: [360] }).scenarios).toHaveLength(1);
    expect(calculateMortgageScenarios({ purchasePrice: { minimumCny: 1_000_000, maximumCny: 1_000_000 } }).status).toBe("unknown");
  });

  it("excludes asking-price and mismatched-property evidence from transaction totals", () => {
    const result = calculateAllInCost({
      market: "示例城市", candidateIds: ["candidate-1"],
      now: new Date("2026-09-20T00:00:00Z"),
      candidateIdentity: { city: "示例城市", community: "甲小区", building: "1栋", unit: "1单元", room: "101" },
      costEvidence: [
        { id: "asking", component: "purchase-price", priceKind: "asking", minimumCny: 1_000_000, maximumCny: 1_000_000, mandatory: true, source: "listing", retrievedAt: "2026-09-19T00:00:00Z", validUntil: "2026-09-21T00:00:00Z", market: "示例城市", candidateId: "candidate-1", propertyIdentity: { city: "示例城市", community: "甲小区", building: "1栋", unit: "1单元", room: "101" }, applicability: "exact", verification: "source-verified", sourceUrl: "https://example.com/asking" },
        { id: "other", component: "deed-tax", minimumCny: 20_000, maximumCny: 20_000, mandatory: true, source: "official", retrievedAt: "2026-09-19T00:00:00Z", validUntil: "2026-09-21T00:00:00Z", market: "示例城市", candidateId: "candidate-1", propertyIdentity: { city: "示例城市", community: "乙小区", building: "1栋", unit: "1单元", room: "101" }, applicability: "exact", verification: "source-verified", sourceUrl: "https://example.com/tax" },
      ],
    });
    expect(result.excludedEvidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "asking", reason: "asking price cannot establish purchase price" }),
      expect.objectContaining({ id: "other", reason: "exact property identity does not match" }),
    ]));
  });
});
