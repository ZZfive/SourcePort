import type { HouseholdFinanceInput, LiquidityAssessment, PurchaseCashScenario, PurchaseSequenceEvent } from "./contracts.js";

function amount(value: number | undefined, field: string, required = false): number {
  if (value === undefined && !required) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${field} must be a finite non-negative number`);
  return value;
}
function months(value: number | undefined, field: string): number {
  const result = amount(value, field);
  if (!Number.isInteger(result) || result > 600) throw new Error(`${field} must be an integer between 0 and 600`);
  return result;
}

export function assessHouseholdLiquidity(finance: HouseholdFinanceInput, scenario: PurchaseCashScenario = {}): LiquidityAssessment {
  const income = amount(finance.monthlyNetIncomeCny, "monthlyNetIncomeCny", true);
  const spend = amount(finance.annualBaselineSpendCny, "annualBaselineSpendCny", true) / 12;
  const initial = amount(finance.liquidReserveCny, "liquidReserveCny", true);
  const debt = amount(finance.existingMonthlyDebtCny, "existingMonthlyDebtCny");
  const monthlyFreeCashFlowCny = income - spend - debt;
  const carCash = amount(scenario.carCashCny, "carCashCny");
  const breakdown = scenario.propertyUpfrontBreakdown;
  const upfront = breakdown ? Object.entries(breakdown).reduce((sum, [key, value]) => sum + amount(value, key, true), 0) : amount(scenario.propertyUpfrontCny, "propertyUpfrontCny");
  if (breakdown && scenario.propertyUpfrontCny !== undefined && Math.abs(upfront - scenario.propertyUpfrontCny) > 0.01) throw new Error("property upfront total and breakdown disagree");
  const carMonth = months(scenario.carPurchaseAfterMonths, "carPurchaseAfterMonths");
  const propertyMonth = months(scenario.propertyPurchaseAfterMonths, "propertyPurchaseAfterMonths");
  const carPayment = amount(scenario.carMonthlyPaymentCny, "carMonthlyPaymentCny");
  const propertyPayment = amount(scenario.propertyMonthlyPaymentCny, "propertyMonthlyPaymentCny");
  const purchases = [
    { month: carMonth, outlay: carCash, label: "car" },
    { month: propertyMonth, outlay: upfront, label: "property" },
    ...(scenario.optionalCommitments ?? []).filter(x => x.enabled === true).map(x => ({
      month: months(x.afterMonths, `${x.id}.afterMonths`), outlay: amount(x.amountCny, `${x.id}.amountCny`, true), label: x.label,
    })),
  ].filter(x => x.outlay > 0).sort((a, b) => a.month - b.month);
  const lastMonth = Math.max(0, ...purchases.map(x => x.month), carPayment ? carMonth : 0, propertyPayment ? propertyMonth : 0);
  const horizon = scenario.evaluationMonths === undefined ? lastMonth : months(scenario.evaluationMonths, "evaluationMonths");
  if (horizon < lastMonth) throw new Error("evaluationMonths cannot end before a purchase");
  let balance = initial;
  let minimumReserveCny = initial;
  const events: PurchaseSequenceEvent[] = [];
  for (let month = 0; month <= horizon; month++) {
    // Payment starts in the first full month after purchase; debt already enters baseline flow.
    if (month > 0) balance += monthlyFreeCashFlowCny - (month > carMonth ? carPayment : 0) - (month > propertyMonth ? propertyPayment : 0);
    const atMonth = purchases.filter(x => x.month === month);
    for (const event of atMonth) balance -= event.outlay;
    minimumReserveCny = Math.min(minimumReserveCny, balance);
    events.push({ month, label: atMonth.map(x => x.label).join("+") || "cash-flow", outlayCny: atMonth.reduce((sum, x) => sum + x.outlay, 0), balanceAfterCny: balance });
  }
  const reserveFloorCny = finance.reserveMonths === undefined ? undefined
    : spend * amount(finance.reserveMonths, "reserveMonths") + amount(finance.plannedCommitmentsCny, "plannedCommitmentsCny");
  const combinedMonthlyPaymentCny = carPayment + propertyPayment;
  const cap = scenario.combinedMonthlyPaymentCapCny === undefined ? undefined : amount(scenario.combinedMonthlyPaymentCapCny, "combinedMonthlyPaymentCapCny");
  const paymentHeadroomCny = cap === undefined ? undefined : cap - combinedMonthlyPaymentCny;
  const postPurchaseMonthlyCashFlowCny = monthlyFreeCashFlowCny - combinedMonthlyPaymentCny;
  const status = reserveFloorCny === undefined ? "unknown" : minimumReserveCny < reserveFloorCny ? "below-floor" : "within-floor";
  const paymentStatus = cap === undefined ? "unknown" : combinedMonthlyPaymentCny > cap || postPurchaseMonthlyCashFlowCny < 0 ? "over-cap" : "within-cap";
  const reasons = [
    status === "unknown" ? "reserve floor is missing; liquidity safety cannot be judged"
      : status === "below-floor" ? "the purchase sequence would reduce liquid reserve below the configured floor" : "planned cash outlay stays above the configured reserve floor",
    paymentStatus === "unknown" ? "combined monthly-payment cap is missing; payment safety is not judged"
      : paymentStatus === "over-cap" ? "combined monthly payments exceed the configured cap or disposable income" : "combined monthly payments stay within the configured cap",
    ...(postPurchaseMonthlyCashFlowCny < 0 ? ["post-purchase cash flow is negative"] : []),
    ...(finance.incomeStability && finance.incomeStability !== "stable" ? ["income continuity is an assumption; reassess under a separate stress scenario"] : []),
  ];
  return {
    monthlyFreeCashFlowCny, annualFreeCashFlowCny: monthlyFreeCashFlowCny * 12,
    plannedCashOutlayCny: purchases.reduce((sum, x) => sum + x.outlay, 0),
    savingsBeforePurchasesCny: monthlyFreeCashFlowCny * (purchases[0]?.month ?? 0),
    remainingReserveCny: balance, minimumReserveCny,
    ...(reserveFloorCny === undefined ? {} : { reserveFloorCny }),
    combinedMonthlyPaymentCny, ...(paymentHeadroomCny === undefined ? {} : { paymentHeadroomCny }),
    events, postPurchaseMonthlyCashFlowCny, paymentStatus, status,
    paused: status !== "within-floor" || paymentStatus !== "within-cap" || postPurchaseMonthlyCashFlowCny < 0, reasons,
  };
}
