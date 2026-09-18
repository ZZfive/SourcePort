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
});
