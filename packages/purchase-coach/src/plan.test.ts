import { describe, expect, it } from "vitest";
import { createPurchasePlan, renderPurchasePlanMarkdown } from "./plan.js";

describe("purchase plan", () => {
  it("pauses a combined purchase when the reserve floor or payment cap is crossed", () => {
    const report = createPurchasePlan({
      finance: { monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 24 },
      scenario: { carCashCny: 200_000, propertyUpfrontCny: 800_000, combinedMonthlyPaymentCapCny: 10_000 },
      coachingMode: "education-and-research",
    });
    expect(report.liquidity.paused).toBe(true);
    expect(report.stage).toBe("bound");
    expect(renderPurchasePlanMarkdown(report)).toContain("买房完整闭环计划");
  });

  it("keeps unresolved property candidates actionable", () => {
    const report = createPurchasePlan({ finance: { monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 18 } }, {
      status: "partial",
      candidates: [{ candidateId: "c1", identity: { community: "示例小区" }, eligibility: "needs-verification", identityStatus: "community-bound", actionItems: ["核验产权"], verificationTasks: [] }],
    });
    expect(report.property.pausedCandidateIds).toEqual(["c1"]);
    expect(report.nextActions.join(" ")).toContain("核验");
  });

  it("does not describe an unpriced property loan as a known zero payment", () => {
    const report = createPurchasePlan({
      finance: { monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 12 },
      scenario: { propertyUpfrontCny: 800_000, combinedMonthlyPaymentCapCny: 10_000 },
    });
    expect(report.liquidity.paymentStatus).toBe("unknown");
    expect(report.unknowns).toContain("房贷月供尚未输入；已输入月供合计不能当作实际房贷月供");
    expect(report.unknowns).not.toContain("车房合计月供上限尚未配置");
  });
});
