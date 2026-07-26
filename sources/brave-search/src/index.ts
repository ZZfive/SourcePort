import { randomUUID } from "node:crypto";

import {
  aggregateSourceHealth,
  BackendRouter,
  createFailure,
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

export interface BraveSearchItem {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
}

export interface BraveSearchData {
  query: string;
  items: BraveSearchItem[];
}

export interface BraveSearchAdapterOptions {
  apiKey?: string | null;
  fetch?: typeof fetch;
  openCliCommand?: string;
}

const manifest = {
  source: "brave-search",
  displayName: "Brave Search",
  version: "1.0.0",
  description: "Bounded web discovery through Brave API or OpenCLI browser search",
} as const;

function normalizedDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function normalizeRows(value: unknown, query: string): BraveSearchData {
  if (!Array.isArray(value)) throw new Error("Brave browser search did not return an array");
  const items = value.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const title = String(record["title"] ?? "").trim();
    const url = String(record["url"] ?? "").trim();
    if (!title || !url) return [];
    const publishedAt = normalizedDate(record["publishedAt"] ?? record["page_age"] ?? record["age"]);
    return [{
      rank: Number(record["rank"]) || index + 1,
      title,
      url,
      snippet: String(record["snippet"] ?? record["description"] ?? "").trim(),
      ...(publishedAt ? { publishedAt } : {}),
    }];
  });
  if (items.length === 0) throw new Error("Brave search returned no usable rows");
  return { query, items };
}

function apiData(value: unknown, query: string): BraveSearchData {
  if (!value || typeof value !== "object") throw new Error("Brave API returned an invalid envelope");
  const web = (value as Record<string, unknown>)["web"];
  const results = web && typeof web === "object"
    ? (web as Record<string, unknown>)["results"]
    : undefined;
  return normalizeRows(results, query);
}

function operation(apiConfigured: boolean): OperationDescriptor {
  return {
    source: manifest.source,
    operation: "search",
    description: "Search the public web through Brave and return discovery leads",
    access: "read",
    schemaVersion: "1.0.0",
    parametersSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query"],
      properties: {
        query: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 18 },
        country: { type: "string", minLength: 2, maxLength: 2 },
        language: { type: "string", minLength: 2, maxLength: 8 },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["query", "items"],
      properties: {
        query: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["rank", "title", "url", "snippet"],
            properties: {
              rank: { type: "integer", minimum: 1 },
              title: { type: "string", minLength: 1 },
              url: { type: "string", minLength: 1 },
              snippet: { type: "string" },
              publishedAt: { type: "string" },
            },
          },
        },
      },
    },
    backends: [
      ...(apiConfigured ? [{ name: "brave-api", kind: "public-http" as const, priority: 0 }] : []),
      { name: "brave-browser", kind: "opencli", priority: apiConfigured ? 1 : 0 },
      { name: "brave-manual", kind: "manual-step", priority: 99 },
    ],
    auth: "optional",
    freshnessClass: "volatile",
  };
}

function invalid(request: SourceRequest, descriptor: OperationDescriptor, message: string): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: descriptor.schemaVersion,
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure("invalid_request", message, "validation"),
    recoveryActions: [],
  };
}

export class BraveSearchAdapter implements SourceAdapter {
  readonly #operation: OperationDescriptor;
  readonly #router: BackendRouter;

  constructor(options: BraveSearchAdapterOptions = {}) {
    const apiKey = options.apiKey === undefined
      ? process.env["BRAVE_SEARCH_API_KEY"] ?? null
      : options.apiKey;
    this.#operation = operation(Boolean(apiKey));
    const backends = [];
    if (apiKey) {
      backends.push(new PublicHttpBackend<BraveSearchData>({
        name: "brave-api",
        request: ({ request }) => {
          const parameters = request.parameters as Record<string, unknown>;
          const query = String(parameters["query"]);
          const limit = Number(parameters["limit"] ?? 10);
          const country = String(parameters["country"] ?? "CN");
          const language = String(parameters["language"] ?? "zh-hans");
          return `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}` +
            `&count=${limit}&country=${encodeURIComponent(country)}` +
            `&search_lang=${encodeURIComponent(language)}`;
        },
        init: () => ({
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
        }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        parse: async ({ response, context }) => {
          const query = String((context.request.parameters as Record<string, unknown>)["query"]);
          return apiData(await response.json(), query);
        },
      }));
    }
    backends.push(new OpenCliBackend({
      name: "brave-browser",
      ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
      jsonOutput: true,
      args: ({ request }) => {
        const parameters = request.parameters as Record<string, unknown>;
        return [
          "brave",
          "search",
          String(parameters["query"]),
          "--limit",
          String(parameters["limit"] ?? 10),
        ];
      },
      parse: (data, context) => normalizeRows(
        data,
        String((context.request.parameters as Record<string, unknown>)["query"]),
      ),
    }));
    backends.push(new ManualStepBackend({
      name: "brave-manual",
      description: "Restore Brave/OpenCLI access and retry the search",
    }));
    this.#router = new BackendRouter(backends);
  }

  manifest() { return manifest; }
  operations() { return [this.#operation]; }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    if (request.operation !== this.#operation.operation) {
      return invalid(request, this.#operation, `Unsupported operation '${request.operation}'`);
    }
    const validation = validateSourceRequest(request, this.#operation.parametersSchema);
    if (!validation.ok) {
      return {
        ...invalid(request, this.#operation, validation.failure.message),
        failure: validation.failure,
        warnings: validation.issues.map((issue) => ({
          code: "validation_issue",
          message: issue.message,
          field: issue.path,
        })),
      };
    }
    return this.#router.execute(validation.value, this.#operation);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const operations = [await probeOperationHealth({
      operation: this.#operation,
      router: this.#router,
      parameters: { query: "汽车召回", limit: 1 },
      runtime,
    })];
    return aggregateSourceHealth({
      source: manifest.source,
      displayName: manifest.displayName,
      checkedAt,
      durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()),
      operations,
    });
  }
}

export const __test__ = { normalizeRows, apiData };
