import { randomUUID } from "node:crypto";

import {
  BackendRouter,
  createEvidenceRecord,
  createFailure,
  humanVerificationRecovery,
  ManualStepBackend,
  probeOperationHealth,
  aggregateSourceHealth,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceHealthRuntime,
  type SourceRequest,
  type SourceResult,
  type SourceRuntime,
  validateSourceRequest,
} from "@sourceport/core";

const manifest = {
  source: "wuhan-property-miniprograms",
  displayName: "Wuhan property mini-program observations",
  version: "1.0.0",
  description: "Manual or browser-assisted observations from named Wuhan property mini-programs",
} as const;

export type MiniProgramName = "fang-mini-program" | "beike-mini-program" | "wuchang-housing-market" | "wufang-service" | "other";
export type MiniProgramChannel = "wechat-mini-program" | "browser-share" | "manual-export";
export type PropertyKind = "new" | "resale";

export interface MiniProgramObservation {
  candidateId: string;
  program: MiniProgramName;
  channel: MiniProgramChannel;
  city: string;
  kind: PropertyKind;
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

const observationOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "record-observation",
  description: "Record one user-supplied or browser-assisted property mini-program observation",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["candidateId", "program", "channel", "city", "kind", "community", "observedAt"],
    properties: {
      candidateId: { type: "string", minLength: 1 },
      program: { enum: ["fang-mini-program", "beike-mini-program", "wuchang-housing-market", "wufang-service", "other"] },
      channel: { enum: ["wechat-mini-program", "browser-share", "manual-export"] },
      city: { type: "string", minLength: 1 },
      kind: { enum: ["new", "resale"] },
      community: { type: "string", minLength: 1 },
      observedAt: { type: "string", minLength: 1 },
      shareRef: { type: "string", minLength: 1 },
      sourceUrl: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      address: { type: "string", minLength: 1 },
      building: { type: "string", minLength: 1 },
      unit: { type: "string", minLength: 1 },
      room: { type: "string", minLength: 1 },
      areaSqm: { type: "number", exclusiveMinimum: 0 },
      bedrooms: { type: "integer", minimum: 0 },
      livingRooms: { type: "integer", minimum: 0 },
      purchasePrice: {
        type: "object",
        additionalProperties: false,
        required: ["minimumCny", "maximumCny"],
        properties: { minimumCny: { type: "number", minimum: 0 }, maximumCny: { type: "number", minimum: 0 } },
      },
      status: { enum: ["available", "reserved", "sold", "unknown"] },
      notes: { type: "string", minLength: 1 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["candidateId", "program", "channel", "city", "kind", "community", "observedAt", "evidenceStatus"],
    properties: {
      candidateId: { type: "string" },
      program: { enum: ["fang-mini-program", "beike-mini-program", "wuchang-housing-market", "wufang-service", "other"] },
      channel: { enum: ["wechat-mini-program", "browser-share", "manual-export"] },
      city: { type: "string" },
      kind: { enum: ["new", "resale"] },
      community: { type: "string" },
      observedAt: { type: "string" },
      shareRef: { type: "string" },
      sourceUrl: { type: "string" },
      title: { type: "string" },
      address: { type: "string" },
      building: { type: "string" },
      unit: { type: "string" },
      room: { type: "string" },
      areaSqm: { type: "number" },
      bedrooms: { type: "integer" },
      livingRooms: { type: "integer" },
      purchasePrice: { type: "object" },
      status: { enum: ["available", "reserved", "sold", "unknown"] },
      notes: { type: "string" },
      evidenceStatus: { const: "claimed" },
    },
  },
  backends: [{ name: "wuhan-property-miniprograms-manual", kind: "manual-step", priority: 0 }],
  auth: "human-assisted",
  freshnessClass: "volatile",
};

function invalid(request: SourceRequest, message: string): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: observationOperation.schemaVersion,
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure("invalid_request", message, "validation"),
    recoveryActions: [],
  };
}

function observation(parameters: Record<string, unknown>): MiniProgramObservation {
  const value = parameters["purchasePrice"];
  const status = parameters["status"] === "available" || parameters["status"] === "reserved" || parameters["status"] === "sold" || parameters["status"] === "unknown"
    ? parameters["status"]
    : undefined;
  const purchasePrice = value && typeof value === "object" && !Array.isArray(value)
    ? { minimumCny: Number((value as Record<string, unknown>)["minimumCny"]), maximumCny: Number((value as Record<string, unknown>)["maximumCny"]) }
    : undefined;
  return {
    candidateId: String(parameters["candidateId"]),
    program: parameters["program"] as MiniProgramName,
    channel: parameters["channel"] as MiniProgramChannel,
    city: String(parameters["city"]),
    kind: parameters["kind"] as PropertyKind,
    community: String(parameters["community"]),
    observedAt: String(parameters["observedAt"]),
    ...(parameters["shareRef"] ? { shareRef: String(parameters["shareRef"]) } : {}),
    ...(parameters["sourceUrl"] ? { sourceUrl: String(parameters["sourceUrl"]) } : {}),
    ...(parameters["title"] ? { title: String(parameters["title"]) } : {}),
    ...(parameters["address"] ? { address: String(parameters["address"]) } : {}),
    ...(parameters["building"] ? { building: String(parameters["building"]) } : {}),
    ...(parameters["unit"] ? { unit: String(parameters["unit"]) } : {}),
    ...(parameters["room"] ? { room: String(parameters["room"]) } : {}),
    ...(parameters["areaSqm"] === undefined ? {} : { areaSqm: Number(parameters["areaSqm"]) }),
    ...(parameters["bedrooms"] === undefined ? {} : { bedrooms: Number(parameters["bedrooms"]) }),
    ...(parameters["livingRooms"] === undefined ? {} : { livingRooms: Number(parameters["livingRooms"]) }),
    ...(purchasePrice ? { purchasePrice } : {}),
    ...(status ? { status } : {}),
    ...(parameters["notes"] ? { notes: String(parameters["notes"]) } : {}),
    evidenceStatus: "claimed",
  };
}

export class WuhanPropertyMiniProgramsAdapter implements SourceAdapter {
  readonly #router = new BackendRouter([
    new ManualStepBackend({
      name: "wuhan-property-miniprograms-manual",
      description: "Open the named mini-program, verify the candidate identity, and provide a structured observation",
    }),
  ]);

  manifest() { return manifest; }
  operations() { return [observationOperation]; }

  async execute(request: SourceRequest, runtime: SourceRuntime): Promise<SourceResult> {
    if (request.operation !== observationOperation.operation) return invalid(request, `Unsupported operation '${request.operation}'`);
    const validation = validateSourceRequest(request, observationOperation.parametersSchema);
    if (!validation.ok) return { ...invalid(request, validation.failure.message), failure: validation.failure, warnings: validation.issues.map((issue) => ({ code: "validation_issue", message: issue.message, field: issue.path })) };
    const parameters = validation.value.parameters as Record<string, unknown>;
    if (!parameters["shareRef"] && !parameters["sourceUrl"]) {
      return {
        ...(await this.#router.execute(validation.value, observationOperation)),
        recoveryActions: [humanVerificationRecovery("Open the named mini-program and provide its share reference or browser URL")],
      };
    }
    const data = observation(parameters);
    const retrievedAt = runtime.now().toISOString();
    const evidence = createEvidenceRecord({
      source: manifest.source,
      operation: observationOperation.operation,
      backend: "manual-observation",
      retrievedAt,
      ...(data.sourceUrl ? { sourceUrl: data.sourceUrl } : {}),
      ...(data.shareRef ? { sourceId: data.shareRef } : {}),
      fragment: data,
      verification: "claimed",
    });
    return {
      requestId: validation.value.requestId ?? randomUUID(),
      source: manifest.source,
      operation: observationOperation.operation,
      operationSchemaVersion: observationOperation.schemaVersion,
      status: "success",
      data,
      backend: "manual-observation",
      retrievedAt,
      freshness: { isLive: true, ageMs: 0 },
      evidence: [evidence],
      warnings: [],
      recoveryActions: [],
    };
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const operation = await probeOperationHealth({ operation: observationOperation, router: this.#router, parameters: { candidateId: "probe", program: "other", channel: "manual-export", city: "configured-market", kind: "resale", community: "probe", observedAt: startedAt.toISOString() }, runtime });
    return aggregateSourceHealth({ source: manifest.source, displayName: manifest.displayName, checkedAt: startedAt.toISOString(), durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()), operations: [operation] });
  }
}

export const __test__ = { observation, observationOperation };
