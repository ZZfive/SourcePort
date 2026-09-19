import type { HouseholdFinanceInput, LiquidityAssessment, PurchaseCashScenario } from "./contracts.js";

function nonNegative(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}

function positive(value: number | undefined, field: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${field} must be a finite positive number`);
  return value;
}

export function assessHouseholdLiquidity(
  finance: HouseholdFinanceInput,
  scenario: PurchaseCashScenario = {},
): LiquidityAssessment {
  const monthlyIncome = positive(finance.monthlyNetIncomeCny, "monthlyNetIncomeCny");
  const annualSpend = positive(finance.annualBaselineSpendCny, "annualBaselineSpendCny");
  const liquidReserve = nonNegative(finance.liquidReserveCny, "liquidReserveCny");
  if (monthlyIncome === undefined || annualSpend === undefined) throw new Error("income and baseline spending are required");
  const plannedCommitments = nonNegative(finance.plannedCommitmentsCny, "plannedCommitmentsCny");
  const monthlyFreeCashFlowCny = monthlyIncome - annualSpend / 12;
  const annualFreeCashFlowCny = monthlyFreeCashFlowCny * 12;
  const plannedCashOutlayCny = nonNegative(scenario.carCashCny, "carCashCny") + nonNegative(scenario.propertyUpfrontCny, "propertyUpfrontCny");
  const remainingReserveCny = liquidReserve - plannedCashOutlayCny;
  const reserveMonths = positive(finance.reserveMonths, "reserveMonths");
  const reserveFloorCny = reserveMonths === undefined ? undefined : annualSpend / 12 * reserveMonths + plannedCommitments;
  const combinedMonthlyPaymentCny = nonNegative(scenario.carMonthlyPaymentCny, "carMonthlyPaymentCny") + nonNegative(scenario.propertyMonthlyPaymentCny, "propertyMonthlyPaymentCny");
  const paymentCap = positive(scenario.combinedMonthlyPaymentCapCny, "combinedMonthlyPaymentCapCny");
  const paymentHeadroomCny = paymentCap === undefined ? undefined : paymentCap - combinedMonthlyPaymentCny;
  const reasons: string[] = [];
  if (monthlyFreeCashFlowCny < 0) reasons.push("baseline spending exceeds monthly net income");
  if (reserveFloorCny === undefined) reasons.push("reserve floor is missing; liquidity safety cannot be judged");
  else if (remainingReserveCny < reserveFloorCny) reasons.push("planned cash outlay would reduce liquid reserve below the configured floor");
  else reasons.push("planned cash outlay stays above the configured reserve floor");
  if (paymentCap === undefined) reasons.push("combined monthly-payment cap is missing; payment safety is not judged");
  else if (paymentHeadroomCny! < 0) reasons.push("combined monthly payments exceed the configured cap");
  else reasons.push("combined monthly payments stay within the configured cap");
  const status: LiquidityAssessment["status"] = reserveFloorCny === undefined
    ? "unknown"
    : remainingReserveCny < reserveFloorCny
      ? "below-floor"
      : "within-floor";
  return {
    monthlyFreeCashFlowCny,
    annualFreeCashFlowCny,
    plannedCashOutlayCny,
    remainingReserveCny,
    ...(reserveFloorCny === undefined ? {} : { reserveFloorCny }),
    combinedMonthlyPaymentCny,
    ...(paymentHeadroomCny === undefined ? {} : { paymentHeadroomCny }),
    status,
    reasons,
  };
}
