export interface HouseholdFinanceInput {
  monthlyNetIncomeCny: number;
  annualBaselineSpendCny: number;
  liquidReserveCny: number;
  /** Required before the coach can judge whether a reserve is protected. */
  reserveMonths?: number;
  plannedCommitmentsCny?: number;
}

export interface PurchaseCashScenario {
  carCashCny?: number;
  propertyUpfrontCny?: number;
  carMonthlyPaymentCny?: number;
  propertyMonthlyPaymentCny?: number;
  combinedMonthlyPaymentCapCny?: number;
}

export type LiquidityStatus = "within-floor" | "below-floor" | "unknown";

export interface LiquidityAssessment {
  monthlyFreeCashFlowCny: number;
  annualFreeCashFlowCny: number;
  plannedCashOutlayCny: number;
  remainingReserveCny: number;
  reserveFloorCny?: number;
  combinedMonthlyPaymentCny: number;
  paymentHeadroomCny?: number;
  status: LiquidityStatus;
  reasons: string[];
}
