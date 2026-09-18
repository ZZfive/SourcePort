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
      operation: { const: "search-listings" },
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["url", "query", "kind", "city"],
        properties: {
          url: { type: "string", minLength: 1 },
          query: { type: "string", minLength: 1 },
          kind: { enum: ["new", "resale"] },
          city: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1, maximum: 30 },
        },
      },
    },
  },
} as const;

export function validatePropertyDiscoveryRequests(input: unknown): ValidationResult<PropertyDiscoveryRequest[]> {
  return validateOperationOutput(input, requestSchema) as ValidationResult<PropertyDiscoveryRequest[]>;
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

function resultData(result: SourceResult): ListingSearchData | undefined {
  if (!result.data || !object(result.data)) return undefined;
  const value = result.data as Record<string, unknown>;
  if (!Array.isArray(value["items"])) return undefined;
  return value as unknown as ListingSearchData;
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
    candidates.push(...data.items.map((item) => candidate(item, request.source, result.evidence)));
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
