import { validateOperationOutput, type ValidationResult } from "@sourceport/core";
import type { PropertyResearchBrief, PropertyCandidateInput } from "./contracts.js";

const text = { type: "string", minLength: 1, pattern: "\\S" };
const nonnegative = { type: "number", minimum: 0 };
const positive = { type: "number", exclusiveMinimum: 0 };
const count = { type: "integer", minimum: 0, maximum: 100 };
const strings = { type: "array", items: text, maxItems: 512, uniqueItems: true };
const timestamp = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}T.+(?:Z|[+-]\\d{2}:\\d{2})$" };
const url = { type: "string", pattern: "^https?://[^\\s]+$" };
const range = object({ minimumCny: nonnegative, maximumCny: nonnegative }, ["minimumCny", "maximumCny"]);
const verification = { enum: ["claimed", "source-verified", "cross-verified"] };
function object(properties: Record<string, unknown>, required: string[] = []) {
  return { type: "object", additionalProperties: false, properties, required };
}
const criterion = object({
  key: text, label: text, kind: { enum: ["hard", "preference", "context"] }, priority: nonnegative, requirement: {},
}, ["key", "label", "kind", "priority", "requirement"]);
const briefSchema = object({
  query: text,
  market: object({ city: text, country: text }, ["city"]),
  housingTypes: { type: "array", minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ["new", "resale"] } },
  budget: object({ maximumAllInCny: positive, maximumPurchaseCny: positive, basis: { const: "all-in" } }, ["maximumAllInCny", "basis"]),
  layout: object({ bedrooms: count, livingRooms: count }),
  commuteAnchors: { type: "array", minItems: 1, maxItems: 8, items: object({ id: text, label: text, priority: { enum: ["primary", "secondary"] } }, ["id", "label"]) },
  financing: object({
    downPaymentRatios: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "number", minimum: 0, maximum: 1 } },
    annualRates: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "number", minimum: 0, maximum: 1 } },
    termsMonths: { type: "array", minItems: 1, maxItems: 8, uniqueItems: true, items: { type: "integer", minimum: 1, maximum: 600 } },
  }, ["downPaymentRatios", "annualRates", "termsMonths"]),
  criteria: { type: "array", maxItems: 64, items: criterion },
  limits: object({
    initialCandidates: { type: "integer", minimum: 1, maximum: 64 },
    evaluatedCandidates: { type: "integer", minimum: 1, maximum: 64 },
    finalCandidates: { type: "integer", minimum: 1, maximum: 8 },
  }),
}, ["query", "market", "housingTypes", "budget", "commuteAnchors"]);

const provenance = { id: text, source: text, sourceUrl: url, retrievedAt: timestamp, market: text, candidateId: text, validUntil: timestamp, verification };
const priceObservation = object({ id: text, kind: { enum: ["asking", "transaction", "offer", "tax-assessment"] }, priceCny: range, source: text, sourceUrl: url, observedAt: timestamp, verification, scope: text }, ["id", "kind", "priceCny", "source", "observedAt"]);
const cost = object({
  ...provenance, component: { enum: ["purchase-price", "deed-tax", "vat", "agency-fee", "registration", "maintenance-fund", "renovation", "parking", "loan-fee", "furnishings", "seller-tax", "other"] },
  minimumCny: nonnegative, maximumCny: nonnegative, mandatory: { type: "boolean" }, applicability: text,
}, ["id", "component", "minimumCny", "maximumCny", "mandatory", "source", "retrievedAt", "applicability"]);
const risk = object({
  ...provenance, category: { enum: ["ownership", "encumbrance", "transaction-restriction", "presale-permit", "delivery", "school", "planning", "property-management", "other"] },
  status: { enum: ["clear", "issue", "unknown"] }, summary: text,
}, ["id", "category", "status", "summary", "source", "retrievedAt"]);
const listing = object({
  listingId: text, source: text, sourceUrl: url, retrievedAt: timestamp, title: text, publishedAt: timestamp,
  priceCny: range, status: { enum: ["available", "reserved", "sold", "unknown"] },
}, ["listingId", "source", "sourceUrl", "retrievedAt"]);
const evidence = object({
  id: text, source: text, operation: text, backend: text, retrievedAt: timestamp, sourceUrl: url, sourceId: text,
  market: text, fragment: {}, artifactRef: text, artifactHash: text, verification,
}, ["id", "source", "operation", "backend", "retrievedAt", "verification"]);
const references = { type: "object", additionalProperties: strings };
const candidateSchema = object({
  candidateId: text, kind: { enum: ["new", "resale"] }, city: text, district: text, community: text, address: text,
  building: text, unit: text, room: text, areaSqm: positive, bedrooms: count, livingRooms: count, floor: text,
  constructionYear: { type: "integer", minimum: 1800, maximum: 2200 }, propertyRightsYears: positive,
  developer: text, deliveryDate: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
  listing, listings: { type: "array", maxItems: 64, items: listing }, askingPrice: range, priceObservations: { type: "array", maxItems: 256, items: priceObservation }, purchasePrice: range,
  costEvidence: { type: "array", maxItems: 256, items: cost }, riskEvidence: { type: "array", maxItems: 256, items: risk },
  commuteMinutes: { type: "object", additionalProperties: nonnegative }, commuteEvidence: references, fieldEvidence: references,
  evidence: { type: "array", maxItems: 512, items: evidence }, sourceUrls: { type: "array", maxItems: 512, items: url },
  observations: { type: "array", maxItems: 64, items: {} },
}, ["candidateId", "kind", "city", "community"]);

/** Strict boundaries: unknown criteria are preserved; unknown structural fields are errors. */
export function validatePropertyResearchBrief(input: unknown): ValidationResult<PropertyResearchBrief> {
  const checked = validateOperationOutput(input, briefSchema);
  if (!checked.ok) return checked;
  const value = input as PropertyResearchBrief;
  const ids = value.commuteAnchors.map(x => x.id);
  const issues = new Set(ids).size === ids.length ? [] : [{ path: "commuteAnchors", message: "anchor IDs must be unique" }];
  const keys = (value.criteria ?? []).map(x => x.key);
  if (new Set(keys).size !== keys.length) issues.push({ path: "criteria", message: "criterion keys must be unique" });
  return issues.length ? { ok: false, issues } : { ok: true, value };
}

export function validatePropertyCandidates(input: unknown): ValidationResult<PropertyCandidateInput[]> {
  const checked = validateOperationOutput(input, { type: "array", maxItems: 1024, items: candidateSchema });
  if (!checked.ok) return checked;
  const value = input as PropertyCandidateInput[];
  const issues: Array<{ path: string; message: string }> = [];
  const evidenceIds = new Map<string, string>();
  const ids = new Set<string>();
  for (const [index, candidate] of value.entries()) {
    const path = `candidates[${index}]`;
    if (ids.has(candidate.candidateId)) issues.push({ path, message: "candidateId must identify one source observation uniquely" });
    ids.add(candidate.candidateId);
    const ranges = [candidate.purchasePrice, candidate.askingPrice, candidate.listing?.priceCny, ...(candidate.listings ?? []).map(x => x.priceCny), ...(candidate.priceObservations ?? []).map(x => x.priceCny), ...(candidate.costEvidence ?? [])];
    if (ranges.some(x => x && x.minimumCny > x.maximumCny)) issues.push({ path, message: "money range minimum exceeds maximum" });
    const records = [...(candidate.evidence ?? []), ...(candidate.costEvidence ?? []), ...(candidate.riskEvidence ?? [])];
    for (const row of records) {
      const serialized = JSON.stringify(row);
      if (evidenceIds.has(row.id) && evidenceIds.get(row.id) !== serialized) issues.push({ path, message: `evidence ID ${row.id} has conflicting content` });
      evidenceIds.set(row.id, serialized);
    }
    const available = new Set((candidate.evidence ?? []).map(x => x.id));
    const refs = [...Object.values(candidate.fieldEvidence ?? {}).flat(), ...Object.values(candidate.commuteEvidence ?? {}).flat()];
    for (const ref of refs) if (!available.has(ref)) issues.push({ path, message: `unresolved evidence reference ${ref}` });
    const timestamps = [...records.flatMap(row => [row.retrievedAt, "validUntil" in row ? row.validUntil : undefined]), ...(candidate.priceObservations ?? []).map(row => row.observedAt), candidate.listing?.retrievedAt, candidate.listing?.publishedAt,
      ...(candidate.listings ?? []).flatMap(row => [row.retrievedAt, row.publishedAt])];
    if (timestamps.some(x => x !== undefined && !Number.isFinite(Date.parse(x)))) issues.push({ path, message: "invalid timestamp" });
    if (candidate.deliveryDate && (!Number.isFinite(Date.parse(candidate.deliveryDate)) || new Date(candidate.deliveryDate).toISOString().slice(0, 10) !== candidate.deliveryDate)) issues.push({ path, message: "invalid delivery date" });
  }
  return issues.length ? { ok: false, issues } : { ok: true, value };
}
