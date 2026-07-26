import { randomUUID } from "node:crypto";

import {
  aggregateSourceHealth,
  BackendRouter,
  createFailure,
  ManualStepBackend,
  OpenCliBackend,
  probeOperationHealth,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceHealthRuntime,
  type SourceRequest,
  type SourceResult,
  type SourceRuntime,
  validateSourceRequest,
} from "@sourceport/core";

const manifest = {
  source: "36kr",
  displayName: "36kr",
  version: "1.0.0",
  description: "Bounded 36kr article search and detail acquisition",
} as const;

export interface Kr36SearchData {
  query: string;
  items: Array<{
    rank: number;
    title: string;
    url: string;
    publishedAt?: string;
  }>;
}

export interface Kr36ArticleData {
  articleId: string;
  title: string;
  author: string;
  publishedAt?: string;
  body: string;
  url: string;
}

const searchOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "search-articles",
  description: "Search 36kr articles by keyword",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 50 },
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
          required: ["rank", "title", "url"],
          properties: {
            rank: { type: "integer", minimum: 1 },
            title: { type: "string", minLength: 1 },
            url: { type: "string", minLength: 1 },
            publishedAt: { type: "string" },
          },
        },
      },
    },
  },
  backends: [
    { name: "36kr-search-browser", kind: "opencli", priority: 0 },
    { name: "36kr-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "optional",
  freshnessClass: "volatile",
};

const articleOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-article",
  description: "Retrieve one 36kr article body",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["id"],
    properties: { id: { type: "string", minLength: 1 } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["articleId", "title", "author", "body", "url"],
    properties: {
      articleId: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      author: { type: "string" },
      publishedAt: { type: "string" },
      body: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
    },
  },
  backends: [
    { name: "36kr-article-browser", kind: "opencli", priority: 0 },
    { name: "36kr-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "optional",
  freshnessClass: "periodic",
};

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim())
    ? `${value.trim()}T00:00:00+08:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function searchData(value: unknown, query: string): Kr36SearchData {
  if (!Array.isArray(value)) throw new Error("36kr search did not return an array");
  const items = value.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const title = String(record["title"] ?? "").trim();
    const url = String(record["url"] ?? "").trim();
    if (!title || !url) return [];
    const publishedAt = isoDate(record["date"]);
    return [{
      rank: Number(record["rank"]) || index + 1,
      title,
      url,
      ...(publishedAt ? { publishedAt } : {}),
    }];
  });
  if (items.length === 0) throw new Error("36kr search returned no usable rows");
  return { query, items };
}

function fields(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) throw new Error("36kr article did not return field rows");
  return Object.fromEntries(value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const field = String(record["field"] ?? "").trim();
    return field ? [[field, String(record["value"] ?? "").trim()]] : [];
  }));
}

function articleData(value: unknown, rawId: string): Kr36ArticleData {
  const record = fields(value);
  const articleId = rawId.match(/\/p\/(\d+)/)?.[1] ?? rawId.replace(/\D/g, "");
  if (!articleId || !record["title"] || !record["body"]) {
    throw new Error("36kr article lacked stable identity, title, or body");
  }
  const publishedAt = isoDate(record["date"]);
  return {
    articleId,
    title: record["title"],
    author: record["author"] ?? "",
    ...(publishedAt ? { publishedAt } : {}),
    body: record["body"],
    url: record["url"] || `https://36kr.com/p/${articleId}`,
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

export class Kr36Adapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(openCliCommand?: string) {
    this.#router = new BackendRouter([
      new OpenCliBackend({
        name: "36kr-search-browser",
        ...(openCliCommand ? { command: openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => {
          const parameters = request.parameters as Record<string, unknown>;
          return ["36kr", "search", String(parameters["query"]), "--limit", String(parameters["limit"] ?? 8)];
        },
        parse: (data, context) => searchData(
          data,
          String((context.request.parameters as Record<string, unknown>)["query"]),
        ),
      }),
      new OpenCliBackend({
        name: "36kr-article-browser",
        ...(openCliCommand ? { command: openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => [
          "36kr",
          "article",
          String((request.parameters as Record<string, unknown>)["id"]),
        ],
        parse: (data, context) => articleData(
          data,
          String((context.request.parameters as Record<string, unknown>)["id"]),
        ),
      }),
      new ManualStepBackend({
        name: "36kr-manual",
        description: "Restore 36kr browser access and retry",
      }),
    ]);
  }

  manifest() { return manifest; }
  operations() { return [searchOperation, articleOperation]; }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    const descriptor = this.operations().find((item) => item.operation === request.operation);
    if (!descriptor) return invalid(request, searchOperation, `Unsupported operation '${request.operation}'`);
    const validation = validateSourceRequest(request, descriptor.parametersSchema);
    if (!validation.ok) {
      return {
        ...invalid(request, descriptor, validation.failure.message),
        failure: validation.failure,
        warnings: validation.issues.map((issue) => ({ code: "validation_issue", message: issue.message, field: issue.path })),
      };
    }
    return this.#router.execute(validation.value, descriptor);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const operations = await Promise.all([
      probeOperationHealth({ operation: searchOperation, router: this.#router, parameters: { query: "小鹏汽车", limit: 1 }, runtime }),
      probeOperationHealth({ operation: articleOperation, router: this.#router, parameters: { id: "3907419421267333" }, runtime }),
    ]);
    return aggregateSourceHealth({
      source: manifest.source,
      displayName: manifest.displayName,
      checkedAt,
      durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()),
      operations,
    });
  }
}

export const __test__ = { searchData, articleData };
