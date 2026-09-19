import { describe, expect, it } from "vitest";
import { assessHouseholdLiquidity } from "./liquidity.js";

describe("household liquidity assessment", () => {
  it("calculates free cash flow and evaluates a combined car/property cash scenario", () => {
    const result = assessHouseholdLiquidity({ monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 18 }, { carCashCny: 200_000, propertyUpfrontCny: 600_000, carMonthlyPaymentCny: 0, propertyMonthlyPaymentCny: 5_000 });
    expect(result.monthlyFreeCashFlowCny).toBe(20_000);
    expect(result.annualFreeCashFlowCny).toBe(240_000);
    expect(result.remainingReserveCny).toBe(200_000);
    expect(result.reserveFloorCny).toBe(180_000);
    expect(result.status).toBe("within-floor");
  });

  it("refuses to claim a safe reserve without a configured floor", () => {
    const result = assessHouseholdLiquidity({ monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000 }, { propertyUpfrontCny: 800_000 });
    expect(result.status).toBe("unknown");
    expect(result.reserveFloorCny).toBeUndefined();
    expect(result.reasons).toContain("reserve floor is missing; liquidity safety cannot be judged");
  });

  it("flags a scenario that consumes the reserve floor", () => {
    const result = assessHouseholdLiquidity({ monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 24 }, { propertyUpfrontCny: 800_000, carCashCny: 200_000 });
    expect(result.status).toBe("below-floor");
    expect(result.reasons).toContain("the purchase sequence would reduce liquid reserve below the configured floor");
  });

  it("includes savings accumulated before a later purchase", () => {
    const result = assessHouseholdLiquidity({ monthlyNetIncomeCny: 30_000, annualBaselineSpendCny: 120_000, liquidReserveCny: 1_000_000, reserveMonths: 18 }, { carCashCny: 150_000, propertyUpfrontCny: 800_000, carPurchaseAfterMonths: 0, propertyPurchaseAfterMonths: 12 });
    expect(result.savingsBeforePurchasesCny).toBe(0);
    expect(result.remainingReserveCny).toBe(290_000);
    expect(result.minimumReserveCny).toBe(290_000);
    expect(result.status).toBe("within-floor");
  });
});
