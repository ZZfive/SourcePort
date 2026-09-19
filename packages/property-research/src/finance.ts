import type { EvidenceRecord } from "@sourceport/core";
import type { FinancingResult, MoneyRange, MortgageScenario, PropertyCostComponent, PropertyCostEvidence, PropertyCostResult, PropertyCostComponentResult } from "./contracts.js";

function sumRanges(values: readonly MoneyRange[]): MoneyRange {
  return values.reduce((total, value) => ({ minimumCny: total.minimumCny + value.minimumCny, maximumCny: total.maximumCny + value.maximumCny }), { minimumCny: 0, maximumCny: 0 });
}

export const ALL_IN_COMPONENTS: readonly PropertyCostComponent[] = [
  "purchase-price", "deed-tax", "vat", "seller-tax", "agency-fee", "registration",
  "maintenance-fund", "renovation", "furnishings", "parking", "loan-fee", "other",
];

export function calculateAllInCost(input: {
  market?: string;
  candidateIds?: readonly string[];
  now?: Date;
  purchasePrice?: MoneyRange;
  costEvidence?: readonly PropertyCostEvidence[];
}): PropertyCostResult {
  const now = (input.now ?? new Date()).getTime();
  const excludedEvidence: PropertyCostResult["excludedEvidence"] = [];
  const components: PropertyCostComponentResult[] = [];
  const grouped = new Map<PropertyCostComponent, PropertyCostEvidence[]>();
  for (const item of input.costEvidence ?? []) {
    const reason = item.market !== input.market ? "market missing or does not match"
      : !item.candidateId || !input.candidateIds?.includes(item.candidateId) ? "exact property applicability missing or different"
      : !item.validUntil || !(Date.parse(item.retrievedAt) <= now && now <= Date.parse(item.validUntil)) ? "evidence validity missing, stale, or future"
      : !item.sourceUrl || !item.verification || item.verification === "claimed" ? "documentary verification is missing"
      : !item.mandatory ? "optional component not confirmed in total budget"
      : undefined;
    if (reason) { excludedEvidence.push({ id: item.id, reason }); continue; }
    const items = grouped.get(item.component) ?? [];
    if (!items.some(existing => existing.id === item.id)) items.push(item);
    grouped.set(item.component, items);
  }
  const reasons: string[] = [];
  let conflict = false;
  for (const [component, quotes] of grouped) {
    // Repeated or alternative quotes are observations, never additive charges.
    const minimumCny = Math.min(...quotes.map(x => x.minimumCny));
    const maximumCny = Math.max(...quotes.map(x => x.maximumCny));
    if (quotes.some(x => x.minimumCny !== quotes[0]!.minimumCny || x.maximumCny !== quotes[0]!.maximumCny)) {
      conflict = true;
      reasons.push(`unreconciled quotes for ${component}`);
    }
    components.push({ component, range: { minimumCny, maximumCny }, mandatory: true,
      source: [...new Set(quotes.map(x => x.source))].join(", "),
      applicability: quotes.map(x => x.applicability).join("; "), evidenceIds: quotes.map(x => x.id) });
  }
  const missingComponents = ALL_IN_COMPONENTS.filter(key => !grouped.has(key));
  if (missingComponents.length) reasons.push(`missing applicable all-in components: ${missingComponents.join(", ")}; explicit documented zero is required for non-applicable charges`);
  reasons.push(...excludedEvidence.map(x => `${x.id}: ${x.reason}`));
  const verified = sumRanges(components.map(x => x.range));
  const reference = input.purchasePrice && !grouped.has("purchase-price") ? input.purchasePrice : undefined;
  if (reference) reasons.push("purchasePrice is supplied as the price basis; the remaining all-in components are not fully evidenced");
  const known = !conflict && !missingComponents.length;
  return {
    status: conflict ? "conflict" : known ? "known" : components.length || reference ? "estimate" : "unknown",
    verifiedLowerBoundCny: conflict ? 0 : verified.minimumCny,
    ...(known ? { range: verified } : {}),
    ...(!conflict && (components.length || reference) ? { estimateRange: reference ? sumRanges([verified, reference]) : verified } : {}),
    components, missingComponents, reasons, excludedEvidence,
    evidenceIds: [...new Set([...(input.costEvidence ?? []).map(x => x.id)])],
  };
}

export function calculateMonthlyPayment(input: { principalCny: number; annualRate: number; months: number }): number | undefined {
  if (!Number.isFinite(input.principalCny) || input.principalCny < 0 || !Number.isFinite(input.annualRate) || input.annualRate < 0 || !Number.isInteger(input.months) || input.months <= 0) return undefined;
  if (input.principalCny === 0) return 0;
  const monthlyRate = input.annualRate / 12;
  if (monthlyRate === 0) return Math.round((input.principalCny / input.months) * 100) / 100;
  // Stable for near-zero rates and long terms; avoid cancellation in factor - 1.
  const denominator = -Math.expm1(-input.months * Math.log1p(monthlyRate));
  const payment = input.principalCny * monthlyRate / denominator;
  return Number.isFinite(payment) ? Math.round(payment * 100) / 100 : undefined;
}

export function calculateMortgageScenarios(input: {
  purchasePrice?: MoneyRange;
  downPaymentRatios?: readonly number[];
  annualRates?: readonly number[];
  termsMonths?: readonly number[];
  allInCost?: PropertyCostResult;
}): FinancingResult {
  const reasons: string[] = [];
  if (!input.purchasePrice) reasons.push("purchase price is missing");
  if (!input.downPaymentRatios?.length) reasons.push("down-payment ratios are missing");
  if (!input.annualRates?.length) reasons.push("annual mortgage rates are missing");
  if (!input.termsMonths?.length) reasons.push("loan terms are missing");
  if (reasons.length) return { status: "unknown", scenarios: [], reasons };
  const scenarios: MortgageScenario[] = [];
  const purchasePrices = input.purchasePrice!.minimumCny === input.purchasePrice!.maximumCny
    ? [input.purchasePrice!.minimumCny]
    : [input.purchasePrice!.minimumCny, input.purchasePrice!.maximumCny];
  for (const purchasePriceCny of purchasePrices) {
    for (const downPaymentRatio of input.downPaymentRatios!) {
      for (const annualRate of input.annualRates!) {
        for (const termMonths of input.termsMonths!) {
          if (downPaymentRatio < 0 || downPaymentRatio > 1 || annualRate < 0 || termMonths <= 0) continue;
          const downPaymentCny = Math.round(purchasePriceCny * downPaymentRatio * 100) / 100;
          const principalCny = Math.round((purchasePriceCny - downPaymentCny) * 100) / 100;
          const monthlyPaymentCny = calculateMonthlyPayment({ principalCny, annualRate, months: termMonths });
          if (monthlyPaymentCny !== undefined) scenarios.push({ downPaymentRatio, annualRate, termMonths, purchasePriceCny, downPaymentCny, principalCny, monthlyPaymentCny,
            totalInterestCny: Math.round((monthlyPaymentCny * termMonths - principalCny) * 100) / 100,
            ...(input.allInCost?.range ? { upfrontCny: {
              minimumCny: Math.max(0, input.allInCost.range.minimumCny - principalCny),
              maximumCny: Math.max(0, input.allInCost.range.maximumCny - principalCny),
            } } : {}),
          });
        }
      }
    }
  }
  if (!scenarios.length) return { status: "unknown", scenarios: [], reasons: ["financing parameters did not produce a valid scenario"] };
  return { status: "scenario", scenarios, reasons: ["Explicit assumption scenarios, not a loan offer or eligibility decision; lifetime interest is separate from the purchase all-in budget"] };
}

export function propertyCostEvidenceRecord(evidence: PropertyCostEvidence): EvidenceRecord {
  return { id: evidence.id, source: evidence.source, operation: "property-research-cost-evidence", backend: "brief", retrievedAt: evidence.retrievedAt, ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}), ...(evidence.market ? { market: evidence.market } : {}), fragment: evidence, verification: evidence.verification ?? "claimed" };
}
