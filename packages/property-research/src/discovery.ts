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

interface MiniProgramObservationData {
  candidateId: string;
  program: string;
  channel: string;
  city: string;
  kind: "new" | "resale";
  community: string;
  observedAt: string;
  shareRef?: string;
  sourceUrl?: string;
  title?: string;
  address?: string;
  building?: string;
  unit?: string;
  room?: string;
  areaSqm?: number;
  bedrooms?: number;
  livingRooms?: number;
  purchasePrice?: { minimumCny: number; maximumCny: number };
  status?: "available" | "reserved" | "sold" | "unknown";
  notes?: string;
  evidenceStatus: "claimed";
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
      operation: { enum: ["search-listings", "get-route-evidence", "record-observation"] },
      parameters: {
        type: "object",
        additionalProperties: false,
        required: ["url"],
        properties: {
          url: { type: "string", minLength: 1 },
          query: { type: "string", minLength: 1 },
          city: { type: "string", minLength: 1 },
          limit: { type: "integer", minimum: 1, maximum: 30 },
          candidateId: { type: "string", minLength: 1 },
          anchorId: { type: "string", minLength: 1 },
          origin: { type: "string", minLength: 1 },
          destination: { type: "string", minLength: 1 },
          mode: { enum: ["driving", "transit", "walking", "cycling"] },
          departureWindow: { type: "string", minLength: 1 },
          program: { type: "string", minLength: 1 },
          channel: { type: "string", minLength: 1 },
          community: { type: "string", minLength: 1 },
          observedAt: { type: "string", minLength: 1 },
          shareRef: { type: "string", minLength: 1 },
          sourceUrl: { type: "string", minLength: 1 },
          kind: { enum: ["new", "resale"] },
          title: { type: "string", minLength: 1 },
          address: { type: "string", minLength: 1 },
          building: { type: "string", minLength: 1 },
          unit: { type: "string", minLength: 1 },
          room: { type: "string", minLength: 1 },
          areaSqm: { type: "number", exclusiveMinimum: 0 },
          bedrooms: { type: "integer", minimum: 0 },
          livingRooms: { type: "integer", minimum: 0 },
          purchasePrice: { type: "object" },
          status: { enum: ["available", "reserved", "sold", "unknown"] },
          notes: { type: "string", minLength: 1 },
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
      : request.operation === "record-observation"
        ? ["candidateId", "program", "channel", "city", "kind", "community", "observedAt"]
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
    candidateId: `${source}:${item.kind}:${item.candidateId}`,
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

function resultData(result: SourceResult): ListingSearchData | RouteEvidenceData | MiniProgramObservationData | undefined {
  if (!result.data || !object(result.data)) return undefined;
  const value = result.data as Record<string, unknown>;
  if (Array.isArray(value["items"])) return value as unknown as ListingSearchData;
  if (value["evidenceStatus"] === "source-verified" || value["evidenceStatus"] === "unresolved") return value as unknown as RouteEvidenceData;
  if (value["evidenceStatus"] === "claimed" && typeof value["candidateId"] === "string" && typeof value["community"] === "string") return value as unknown as MiniProgramObservationData;
  return undefined;
}

function enrichCandidate(target: PropertyCandidateInput, data: MiniProgramObservationData, evidence: EvidenceRecord[]): void {
  const observed = {
    candidateId: target.candidateId,
    kind: data.kind,
    city: data.city,
    community: data.community,
    ...(data.address ? { address: data.address } : {}),
    ...(data.building ? { building: data.building } : {}),
    ...(data.unit ? { unit: data.unit } : {}),
    ...(data.room ? { room: data.room } : {}),
    ...(data.areaSqm === undefined ? {} : { areaSqm: data.areaSqm }),
    ...(data.bedrooms === undefined ? {} : { bedrooms: data.bedrooms }),
    ...(data.livingRooms === undefined ? {} : { livingRooms: data.livingRooms }),
    ...(data.purchasePrice ? { purchasePrice: data.purchasePrice } : {}),
  } satisfies PropertyCandidateInput;
  target.observations = [...(target.observations ?? []), observed];
  for (const [field, value] of Object.entries(observed)) {
    if (["candidateId", "kind", "city", "community"].includes(field) || value === undefined) continue;
    const key = field as keyof PropertyCandidateInput;
    if (target[key] === undefined) (target as unknown as Record<string, unknown>)[field] = value;
  }
  target.evidence = [...(target.evidence ?? []), ...evidence];
  target.sourceUrls = [...new Set([...(target.sourceUrls ?? []), ...(data.sourceUrl ? [data.sourceUrl] : [])])];
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
      continue;
    }
    if (request.operation === "record-observation") {
      const observation = data as MiniProgramObservationData;
      const target = candidates.find((item) => item.candidateId === observation.candidateId);
      if (!target) {
        warnings.push({ code: "observation_candidate_unresolved", message: `mini-program observation referenced unknown candidate '${observation.candidateId}'` });
      } else {
        enrichCandidate(target, observation, result.evidence);
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
