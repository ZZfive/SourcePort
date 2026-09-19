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

function months(value: number | undefined, field: string): number {
  if (value === undefined) return 0;
  if (!Number.isInteger(value) || value < 0) throw new Error(`${field} must be a non-negative integer`);
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
  const carCashCny = nonNegative(scenario.carCashCny, "carCashCny");
  const propertyUpfrontCny = nonNegative(scenario.propertyUpfrontCny, "propertyUpfrontCny");
  const carPurchaseAfterMonths = months(scenario.carPurchaseAfterMonths, "carPurchaseAfterMonths");
  const propertyPurchaseAfterMonths = months(scenario.propertyPurchaseAfterMonths, "propertyPurchaseAfterMonths");
  const events = [
    { month: carPurchaseAfterMonths, outlay: carCashCny, label: "car" },
    { month: propertyPurchaseAfterMonths, outlay: propertyUpfrontCny, label: "property" },
  ].filter((event) => event.outlay > 0).sort((a, b) => a.month - b.month);
  let balance = liquidReserve;
  let previousMonth = 0;
  let minimumReserveCny = balance;
  for (const event of events) {
    balance += monthlyFreeCashFlowCny * (event.month - previousMonth);
    balance -= event.outlay;
    minimumReserveCny = Math.min(minimumReserveCny, balance);
    previousMonth = event.month;
  }
  const savingsBeforePurchasesCny = monthlyFreeCashFlowCny * (events.length ? events[0]!.month : 0);
  const plannedCashOutlayCny = carCashCny + propertyUpfrontCny;
  const remainingReserveCny = balance;
  const reserveMonths = positive(finance.reserveMonths, "reserveMonths");
  const reserveFloorCny = reserveMonths === undefined ? undefined : annualSpend / 12 * reserveMonths + plannedCommitments;
  const combinedMonthlyPaymentCny = nonNegative(scenario.carMonthlyPaymentCny, "carMonthlyPaymentCny") + nonNegative(scenario.propertyMonthlyPaymentCny, "propertyMonthlyPaymentCny");
  const paymentCap = positive(scenario.combinedMonthlyPaymentCapCny, "combinedMonthlyPaymentCapCny");
  const paymentHeadroomCny = paymentCap === undefined ? undefined : paymentCap - combinedMonthlyPaymentCny;
  const reasons: string[] = [];
  if (monthlyFreeCashFlowCny < 0) reasons.push("baseline spending exceeds monthly net income");
  if (reserveFloorCny === undefined) reasons.push("reserve floor is missing; liquidity safety cannot be judged");
  else if (minimumReserveCny < reserveFloorCny) reasons.push("the purchase sequence would reduce liquid reserve below the configured floor");
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
    savingsBeforePurchasesCny,
    remainingReserveCny,
    minimumReserveCny,
    ...(reserveFloorCny === undefined ? {} : { reserveFloorCny }),
    combinedMonthlyPaymentCny,
    ...(paymentHeadroomCny === undefined ? {} : { paymentHeadroomCny }),
    status,
    reasons,
  };
}
