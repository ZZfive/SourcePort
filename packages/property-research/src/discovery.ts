import { validateOperationOutput, type EvidenceRecord, type SourceResult, type SourceWarning, type RecoveryAction, type ValidationResult } from "@sourceport/core";
import type {
  PropertyCandidateInput,
  PropertyDiscoveryDependencies,
  PropertyDiscoveryRequest,
  PropertyDiscoveryResult,
  PropertyListing,
} from "./contracts.js";

interface ListingItem {
  candidateId: string;
  kind: "new" | "resale";
  city: string;
  community: string;
  title: string;
  sourceUrl: string;
  retrievedAt: string;
  priceCny?: { minimumCny: number; maximumCny: number };
  areaSqm?: number;
  bedrooms?: number;
  livingRooms?: number;
  district?: string;
  evidenceStatus: "lead-only";
}

interface ListingSearchData {
  query: string;
  kind: "new" | "resale";
  items: ListingItem[];
}

interface RouteEvidenceData {
  candidateId?: string;
  anchorId?: string;
  durationMinutes?: number;
  evidenceStatus: "source-verified" | "unresolved";
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const requestSchema = {
  type: "array",
  minItems: 1,
  maxItems: 16,
  items: {
    type: "object",
    additionalProperties: false,
    required: ["source", "operation", "parameters"],
    properties: {
      source: { type: "string", minLength: 1 },
      operation: { enum: ["search-listings", "get-route-evidence"] },
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1 },
          query: { type: "string", minLength: 1 },
          kind: { enum: ["new", "resale"] },
          city: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1, maximum: 30 },
          candidateId: { type: "string", minLength: 1 },
          anchorId: { type: "string", minLength: 1 },
          origin: { type: "string", minLength: 1 },
          destination: { type: "string", minLength: 1 },
          mode: { enum: ["driving", "transit", "walking", "cycling"] },
          departureWindow: { type: "string", minLength: 1 },
        },
      },
    },
  },
} as const;

export function validatePropertyDiscoveryRequests(input: unknown): ValidationResult<PropertyDiscoveryRequest[]> {
  const result = validateOperationOutput(input, requestSchema) as ValidationResult<PropertyDiscoveryRequest[]>;
  if (!result.ok) return result;
  const issues: Array<{ path: string; message: string }> = [];
  result.value.forEach((request, index) => {
    const required = request.operation === "search-listings"
      ? ["query", "kind", "city"]
      : ["candidateId", "anchorId", "origin", "destination", "mode"];
    for (const field of required) {
      const value = request.parameters[field];
      if (typeof value !== "string" || !value.trim()) issues.push({ path: `${index}.parameters.${field}`, message: `must provide ${field} for ${request.operation}` });
    }
  });
  return issues.length ? { ok: false, issues } : result;
}

function listing(item: ListingItem, source: string): PropertyListing {
  return {
    listingId: item.candidateId,
    source,
    sourceUrl: item.sourceUrl,
    retrievedAt: item.retrievedAt,
    title: item.title,
    ...(item.priceCny ? { priceCny: item.priceCny } : {}),
    status: "unknown",
  };
}

function candidate(item: ListingItem, source: string, evidence: EvidenceRecord[]): PropertyCandidateInput {
  return {
    candidateId: `${source}:${item.candidateId}`,
    kind: item.kind,
    city: item.city,
    ...(item.district ? { district: item.district } : {}),
    community: item.community,
    ...(item.areaSqm === undefined ? {} : { areaSqm: item.areaSqm }),
    ...(item.bedrooms === undefined ? {} : { bedrooms: item.bedrooms }),
    ...(item.livingRooms === undefined ? {} : { livingRooms: item.livingRooms }),
    ...(item.priceCny ? { purchasePrice: item.priceCny } : {}),
    listing: listing(item, source),
    sourceUrls: [item.sourceUrl],
    evidence,
  };
}

function resultData(result: SourceResult): ListingSearchData | RouteEvidenceData | undefined {
  if (!result.data || !object(result.data)) return undefined;
  const value = result.data as Record<string, unknown>;
  if (Array.isArray(value["items"])) return value as unknown as ListingSearchData;
  if (value["evidenceStatus"] === "source-verified" || value["evidenceStatus"] === "unresolved") return value as unknown as RouteEvidenceData;
  return undefined;
}

export async function discoverPropertyCandidates(
  requests: readonly PropertyDiscoveryRequest[],
  dependencies: PropertyDiscoveryDependencies,
): Promise<PropertyDiscoveryResult> {
  const sourceResults: SourceResult[] = [];
  const candidates: PropertyCandidateInput[] = [];
  const warnings: SourceWarning[] = [];
  const recoveryActions: RecoveryAction[] = [];

  for (const request of requests) {
    const result = await dependencies.execute({
      source: request.source,
      operation: request.operation,
      parameters: request.parameters,
      freshness: { mode: "live" },
      execution: { timeoutMs: 15_000, retryBudget: 2 },
    });
    sourceResults.push(result);
    warnings.push(...result.warnings);
    recoveryActions.push(...result.recoveryActions);
    const data = resultData(result);
    if (!data) continue;
    if (request.operation === "search-listings" && "items" in data) {
      candidates.push(...data.items.map((item) => candidate(item, request.source, result.evidence)));
      continue;
    }
    if (request.operation === "get-route-evidence") {
      const route = data as RouteEvidenceData;
      if (!route.candidateId || !route.anchorId) {
        warnings.push({ code: "route_context_missing", message: "route evidence did not identify a candidate and commute anchor" });
        continue;
      }
      const target = candidates.find((item) => item.candidateId === route.candidateId);
      if (target && route.durationMinutes !== undefined) {
        target.commuteMinutes = { ...(target.commuteMinutes ?? {}), [route.anchorId]: route.durationMinutes };
        target.commuteEvidence = { ...(target.commuteEvidence ?? {}), [route.anchorId]: [...(target.commuteEvidence?.[route.anchorId] ?? []), ...result.evidence.map((item) => item.id)] };
        target.evidence = [...(target.evidence ?? []), ...result.evidence];
      } else {
        warnings.push({ code: "route_evidence_unresolved", message: target ? `route evidence for '${route.anchorId}' did not expose a duration` : `route evidence referenced unknown candidate '${route.candidateId}'` });
      }
    }
  }

  const deduplicated = [...new Map(candidates.map((item) => [item.candidateId, item])).values()];
  const failed = sourceResults.some((result) => result.status === "failed" || result.status === "blocked");
  const status = !sourceResults.length || (failed && !deduplicated.length)
    ? "failed"
    : failed
      ? "partial"
      : "success";
  return {
    status,
    candidates: deduplicated,
    sourceResults,
    warnings,
    recoveryActions: [...new Map(recoveryActions.map((item) => [JSON.stringify(item), item])).values()],
  };
}
