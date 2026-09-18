import { randomUUID } from "node:crypto";

import {
  aggregateSourceHealth,
  BackendRouter,
  createFailure,
  humanVerificationRecovery,
  ManualStepBackend,
  OpenCliBackend,
  probeOperationHealth,
  PublicHttpBackend,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceHealthRuntime,
  type SourceRequest,
  type SourceResult,
  type SourceRuntime,
  validateSourceRequest,
} from "@sourceport/core";

const manifest = {
  source: "property-routes",
  displayName: "Public map route evidence",
  version: "1.0.0",
  description: "Bounded route-time evidence for comparing property commute anchors",
} as const;

const allowedHosts = new Set(["map.baidu.com", "ditu.baidu.com", "ditu.amap.com", "www.amap.com", "uri.amap.com"]);

export type RouteMode = "driving" | "transit" | "walking" | "cycling";
export interface RouteEvidence {
  candidateId?: string;
  anchorId?: string;
  origin: string;
  destination: string;
  mode: RouteMode;
  departureWindow?: string;
  durationMinutes?: number;
  distanceKm?: number;
  evidenceStatus: "source-verified" | "unresolved";
  url: string;
  retrievedAt: string;
}

const routeOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-route-evidence",
  description: "Retrieve public route duration evidence for one origin and destination",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["url", "origin", "destination", "mode"],
    properties: {
      url: { type: "string", minLength: 1 },
      candidateId: { type: "string", minLength: 1 },
      anchorId: { type: "string", minLength: 1 },
      origin: { type: "string", minLength: 1 },
      destination: { type: "string", minLength: 1 },
      mode: { enum: ["driving", "transit", "walking", "cycling"] },
      departureWindow: { type: "string", minLength: 1 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["origin", "destination", "mode", "evidenceStatus", "url", "retrievedAt"],
    properties: {
      origin: { type: "string", minLength: 1 },
      destination: { type: "string", minLength: 1 },
      candidateId: { type: "string", minLength: 1 },
      anchorId: { type: "string", minLength: 1 },
      mode: { enum: ["driving", "transit", "walking", "cycling"] },
      departureWindow: { type: "string" },
      durationMinutes: { type: "number", minimum: 0 },
      distanceKm: { type: "number", minimum: 0 },
      evidenceStatus: { enum: ["source-verified", "unresolved"] },
      url: { type: "string", minLength: 1 },
      retrievedAt: { type: "string", minLength: 1 },
    },
  },
  backends: [
    { name: "property-routes-public", kind: "public-http", priority: 0 },
    { name: "property-routes-browser", kind: "opencli", priority: 1 },
    { name: "property-routes-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "none",
  freshnessClass: "volatile",
};

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function clean(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDuration(value: string): number | undefined {
  const hours = value.match(/(\d+(?:\.\d+)?)\s*(?:小时|小時|h|hr)/i);
  const minutes = value.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分鐘|分|min|mins)/i);
  if (!hours && !minutes) return undefined;
  return Math.round((hours ? Number(hours[1]) * 60 : 0) + (minutes ? Number(minutes[1]) : 0));
}

function parseDistance(value: string): number | undefined {
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:公里|千米|km)/i) ?? value.match(/(\d+(?:\.\d+)?)\s*米/);
  if (!match) return undefined;
  const distance = Number(match[1]);
  return /米$/.test(match[0] ?? "") ? distance / 1000 : distance;
}

function parseRoute(body: string, parameters: Record<string, unknown>): RouteEvidence {
  const url = String(parameters["url"]);
  const text = clean(body);
  const durationMinutes = parseDuration(text);
  const distanceKm = parseDistance(text);
  const retrievedAt = new Date().toISOString();
  return {
    ...(parameters["candidateId"] ? { candidateId: String(parameters["candidateId"]) } : {}),
    ...(parameters["anchorId"] ? { anchorId: String(parameters["anchorId"]) } : {}),
    origin: String(parameters["origin"]),
    destination: String(parameters["destination"]),
    mode: parameters["mode"] as RouteMode,
    ...(parameters["departureWindow"] ? { departureWindow: String(parameters["departureWindow"]) } : {}),
    ...(durationMinutes === undefined ? {} : { durationMinutes }),
    ...(distanceKm === undefined ? {} : { distanceKm }),
    evidenceStatus: durationMinutes === undefined ? "unresolved" : "source-verified",
    url,
    retrievedAt,
  };
}

function invalid(request: SourceRequest, message: string): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: routeOperation.schemaVersion,
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure("invalid_request", message, "validation"),
    recoveryActions: [],
  };
}

export class PropertyRoutesAdapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(options: { fetch?: typeof fetch; openCliCommand?: string } = {}) {
    const headers = { "User-Agent": "Mozilla/5.0 SourcePort/1.0", "Accept-Language": "zh-CN,zh;q=0.9" };
    this.#router = new BackendRouter([
      new PublicHttpBackend<RouteEvidence>({
        name: "property-routes-public",
        request: ({ request }) => String((request.parameters as Record<string, unknown>)["url"]),
        init: () => ({ redirect: "follow", headers }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        classify: ({ body }) => /验证码|访问验证|captcha/i.test(body)
          ? { status: "blocked" as const, code: "human_verification_required" as const, message: "map source requires access verification", recoveryActions: [humanVerificationRecovery("Complete map source verification in a browser")] }
          : undefined,
        classifyError: ({ error }) => ({ status: "failed" as const, code: "source_drift" as const, message: error instanceof Error ? error.message : "map route parser failed", retryable: true }),
        parse: ({ body, context }) => parseRoute(body, context.request.parameters as Record<string, unknown>),
      }),
      new OpenCliBackend({
        name: "property-routes-browser",
        ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => ["web", "read", "--url", String((request.parameters as Record<string, unknown>)["url"]), "--stdout", "true", "--download-images", "false", "--wait", "1"],
        parse: (data, context) => {
          const value = typeof data === "string" ? data : data && typeof data === "object" ? String((data as Record<string, unknown>)["markdown"] ?? (data as Record<string, unknown>)["content"] ?? "") : "";
          if (!value) throw new Error("map browser reader returned no route content");
          return parseRoute(value, context.request.parameters as Record<string, unknown>);
        },
      }),
      new ManualStepBackend({ name: "property-routes-manual", description: "Open the map route in a browser and retry" }),
    ]);
  }

  manifest() { return manifest; }
  operations() { return [routeOperation]; }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    if (request.operation !== routeOperation.operation) return invalid(request, `Unsupported operation '${request.operation}'`);
    const validation = validateSourceRequest(request, routeOperation.parametersSchema);
    if (!validation.ok) return { ...invalid(request, validation.failure.message), failure: validation.failure, warnings: validation.issues.map((issue) => ({ code: "validation_issue", message: issue.message, field: issue.path })) };
    const url = String((validation.value.parameters as Record<string, unknown>)["url"]);
    if (!validUrl(url)) return invalid(request, "route URL must be HTTPS on an allowlisted public map host");
    return this.#router.execute(validation.value, routeOperation);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const operations = await probeOperationHealth({ operation: routeOperation, router: this.#router, parameters: { url: "https://map.baidu.com/", origin: "configured-origin", destination: "configured-destination", mode: "driving" }, runtime });
    return aggregateSourceHealth({ source: manifest.source, displayName: manifest.displayName, checkedAt: startedAt.toISOString(), durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()), operations: [operations] });
  }
}

export const __test__ = { parseRoute, parseDuration, parseDistance, validUrl, routeOperation };
