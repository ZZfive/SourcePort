import type { EvidenceRecord } from "@sourceport/core";

import type {
  CostComponent,
  CostEvidence,
  MoneyRange,
  OnRoadCost,
  OnRoadCostComponent,
} from "./contracts.js";

const REQUIRED_COMPONENTS: CostComponent[] = [
  "vehicle-price",
  "purchase-tax",
  "insurance",
  "registration",
];

function roundCny(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePriceRangeCny(value: string): MoneyRange | undefined {
  const text = value.replaceAll(",", "").trim();
  if (!text) {
    return undefined;
  }
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  if (matches.length === 0 || matches.some((number) => !Number.isFinite(number))) {
    return undefined;
  }
  const multiplier = /万/.test(text) ? 10_000 : 1;
  const minimum = Math.min(...matches) * multiplier;
  const maximum = Math.max(...matches) * multiplier;
  return { minimumCny: roundCny(minimum), maximumCny: roundCny(maximum) };
}

export function costEvidenceRecord(evidence: CostEvidence): EvidenceRecord {
  return {
    id: evidence.id,
    source: evidence.source,
    operation: "car-research-cost-evidence",
    backend: "brief",
    retrievedAt: evidence.retrievedAt,
    ...(evidence.sourceUrl ? { sourceUrl: evidence.sourceUrl } : {}),
    ...(evidence.market ? { market: evidence.market } : {}),
    fragment: evidence,
    verification: evidence.sourceUrl ? "source-verified" : "claimed",
  };
}

function appliesToCandidate(
  evidence: CostEvidence,
  seriesId: string,
  trimId: string,
  market: string,
): boolean {
  if (evidence.market && evidence.market !== market) {
    return false;
  }
  if (evidence.appliesTo?.seriesId && evidence.appliesTo.seriesId !== seriesId) {
    return false;
  }
  if (evidence.appliesTo?.trimId && evidence.appliesTo.trimId !== trimId) {
    return false;
  }
  return true;
}

function sumRanges(components: readonly OnRoadCostComponent[]): MoneyRange {
  return components.reduce(
    (total, component) => ({
      minimumCny: total.minimumCny + component.range.minimumCny,
      maximumCny: total.maximumCny + component.range.maximumCny,
    }),
    { minimumCny: 0, maximumCny: 0 },
  );
}

export function calculateOnRoadCost(input: {
  market: string;
  seriesId: string;
  trimId: string;
  vehicleReferencePrice?: MoneyRange;
  vehicleEvidenceIds: string[];
  costEvidence: readonly CostEvidence[];
}): OnRoadCost {
  const applicable = input.costEvidence.filter((evidence) =>
    appliesToCandidate(evidence, input.seriesId, input.trimId, input.market));
  const components: OnRoadCostComponent[] = applicable.map((evidence) => ({
    component: evidence.component,
    range: {
      minimumCny: evidence.minimumCny,
      maximumCny: evidence.maximumCny,
    },
    source: evidence.source,
    applicability: evidence.applicability,
    evidenceIds: [evidence.id],
  }));
  if (input.vehicleReferencePrice) {
    components.push({
      component: "vehicle-reference",
      range: input.vehicleReferencePrice,
      source: "dongchedi",
      applicability: "source reference price; not verified as a Wuhan transaction price",
      evidenceIds: input.vehicleEvidenceIds,
    });
  }

  const present = new Set(applicable.map((evidence) => evidence.component));
  const missingComponents = REQUIRED_COMPONENTS.filter((component) => !present.has(component));
  const mandatoryComponents = components.filter((component) => component.component !== "vehicle-reference")
    .filter((component) => {
      const evidence = applicable.find((candidate) => candidate.id === component.evidenceIds[0]);
      return evidence?.mandatory !== false;
    });
  const estimateComponents = [...mandatoryComponents];
  if (!present.has("vehicle-price") && input.vehicleReferencePrice) {
    const reference = components.find((component) => component.component === "vehicle-reference");
    if (reference) {
      estimateComponents.push(reference);
    }
  }
  const reasons: string[] = [];
  if (missingComponents.length > 0) {
    reasons.push(`missing applicable evidence for: ${missingComponents.join(", ")}`);
  }
  if (!present.has("vehicle-price") && input.vehicleReferencePrice) {
    reasons.push("vehicle price is a source reference, not a verified Wuhan transaction price");
  }
  const known = missingComponents.length === 0;
  const evidenceIds = [...new Set(components.flatMap((component) => component.evidenceIds))];
  return {
    status: known ? "known" : "unknown",
    ...(known ? { range: sumRanges(mandatoryComponents) } : {}),
    ...(estimateComponents.length > 0 ? { estimateRange: sumRanges(estimateComponents) } : {}),
    components,
    missingComponents,
    reasons,
    evidenceIds,
  };
}
