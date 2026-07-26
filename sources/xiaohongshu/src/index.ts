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
  source: "xiaohongshu",
  displayName: "Xiaohongshu",
  version: "1.0.0",
  description: "Bounded Xiaohongshu note and comment acquisition through a logged-in OpenCLI session",
} as const;

const commonItem = {
  type: "object",
  additionalProperties: false,
  required: ["noteId", "title", "author", "url"],
  properties: {
    noteId: { type: "string", minLength: 1 },
    title: { type: "string", minLength: 1 },
    author: { type: "string" },
    url: { type: "string", minLength: 1 },
    publishedAt: { type: "string" },
    likes: { type: "string" },
  },
} as const;

const searchOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "search-notes",
  description: "Search Xiaohongshu notes by keyword",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 20 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query", "items"],
    properties: {
      query: { type: "string" },
      items: { type: "array", items: commonItem },
    },
  },
  backends: [
    { name: "xiaohongshu-search-browser", kind: "opencli", priority: 0 },
    { name: "xiaohongshu-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "required",
  freshnessClass: "volatile",
};

const noteOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-note",
  description: "Retrieve one Xiaohongshu note",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["note"],
    properties: { note: { type: "string", minLength: 1 } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["noteId", "title", "author", "content", "url", "likes", "collects", "comments"],
    properties: {
      noteId: { type: "string", minLength: 1 },
      title: { type: "string" },
      author: { type: "string" },
      content: { type: "string" },
      url: { type: "string", minLength: 1 },
      likes: { type: "string" },
      collects: { type: "string" },
      comments: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
  },
  backends: [
    { name: "xiaohongshu-note-browser", kind: "opencli", priority: 0 },
    { name: "xiaohongshu-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "required",
  freshnessClass: "volatile",
};

const commentsOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-comments",
  description: "Retrieve bounded top-level Xiaohongshu comments",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["note"],
    properties: {
      note: { type: "string", minLength: 1 },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["noteId", "url", "items"],
    properties: {
      noteId: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["rank", "author", "text", "likes"],
          properties: {
            rank: { type: "integer", minimum: 1 },
            author: { type: "string" },
            authorId: { type: "string" },
            text: { type: "string" },
            likes: { type: "string" },
            publishedAt: { type: "string" },
          },
        },
      },
    },
  },
  backends: [
    { name: "xiaohongshu-comments-browser", kind: "opencli", priority: 0 },
    { name: "xiaohongshu-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "required",
  freshnessClass: "volatile",
};

function noteId(value: string): string {
  return value.match(/\/(?:search_result|explore|note)\/([0-9a-f]{24})/i)?.[1] ?? value;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const normalized = /^\d{4}-\d{1,2}-\d{1,2}$/.test(value.trim())
    ? `${value.trim()}T00:00:00+08:00`
    : value;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function searchData(value: unknown, query: string) {
  if (!Array.isArray(value)) throw new Error("Xiaohongshu search did not return an array");
  const items = value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const title = String(record["title"] ?? "").trim();
    const url = String(record["url"] ?? "").trim();
    if (!title || !url) return [];
    const publishedAt = isoDate(record["published_at"]);
    return [{
      noteId: noteId(url),
      title,
      author: String(record["author"] ?? "").trim(),
      url,
      ...(publishedAt ? { publishedAt } : {}),
      likes: String(record["likes"] ?? "").trim(),
    }];
  });
  if (items.length === 0) throw new Error("Xiaohongshu search returned no usable notes");
  return { query, items };
}

function fieldRecord(value: unknown): Record<string, string> {
  if (!Array.isArray(value)) throw new Error("Xiaohongshu detail did not return field rows");
  return Object.fromEntries(value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const field = String(record["field"] ?? "").trim();
    return field ? [[field, String(record["value"] ?? "").trim()]] : [];
  }));
}

function noteData(value: unknown, rawNote: string) {
  const record = fieldRecord(value);
  if (!record["title"] && !record["author"]) throw new Error("Xiaohongshu note lacked title and author");
  return {
    noteId: noteId(rawNote),
    title: record["title"] ?? "",
    author: record["author"] ?? "",
    content: record["content"] ?? "",
    url: rawNote,
    likes: record["likes"] ?? "0",
    collects: record["collects"] ?? "0",
    comments: record["comments"] ?? "0",
    ...(record["tags"] ? { tags: record["tags"].split(",").map((item) => item.trim()).filter(Boolean) } : {}),
  };
}

function commentsData(value: unknown, rawNote: string, limit = 10) {
  if (!Array.isArray(value)) throw new Error("Xiaohongshu comments did not return an array");
  const items = value.flatMap((row, index) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const text = String(record["text"] ?? "").trim();
    if (!text || Boolean(record["is_reply"])) return [];
    const publishedAt = isoDate(record["time"]);
    return [{
      rank: Number(record["rank"]) || index + 1,
      author: String(record["author"] ?? "").trim(),
      authorId: String(record["userId"] ?? "").trim(),
      text,
      likes: String(record["likes"] ?? "").trim(),
      ...(publishedAt ? { publishedAt } : {}),
    }];
  }).slice(0, limit);
  return { noteId: noteId(rawNote), url: rawNote, items };
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

export class XiaohongshuAdapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(openCliCommand?: string) {
    const command = openCliCommand ? { command: openCliCommand } : {};
    this.#router = new BackendRouter([
      new OpenCliBackend({
        name: "xiaohongshu-search-browser",
        ...command,
        jsonOutput: true,
        args: ({ request }) => {
          const parameters = request.parameters as Record<string, unknown>;
          return ["xiaohongshu", "search", String(parameters["query"]), "--limit", String(parameters["limit"] ?? 8)];
        },
        parse: (data, context) => searchData(data, String((context.request.parameters as Record<string, unknown>)["query"])),
      }),
      new OpenCliBackend({
        name: "xiaohongshu-note-browser",
        ...command,
        jsonOutput: true,
        args: ({ request }) => ["xiaohongshu", "note", String((request.parameters as Record<string, unknown>)["note"])],
        parse: (data, context) => noteData(data, String((context.request.parameters as Record<string, unknown>)["note"])),
      }),
      new OpenCliBackend({
        name: "xiaohongshu-comments-browser",
        ...command,
        jsonOutput: true,
        args: ({ request }) => {
          const parameters = request.parameters as Record<string, unknown>;
          return ["xiaohongshu", "comments", String(parameters["note"]), "--limit", String(parameters["limit"] ?? 10)];
        },
        parse: (data, context) => {
          const parameters = context.request.parameters as Record<string, unknown>;
          return commentsData(data, String(parameters["note"]), Number(parameters["limit"] ?? 10));
        },
      }),
      new ManualStepBackend({
        name: "xiaohongshu-manual",
        description: "Log in to Xiaohongshu or restore the OpenCLI browser connection, then retry",
      }),
    ]);
  }

  manifest() { return manifest; }
  operations() { return [searchOperation, noteOperation, commentsOperation]; }

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
    const seed = await this.execute({
      source: manifest.source,
      operation: searchOperation.operation,
      parameters: { query: "汽车用车体验", limit: 1 },
      execution: { timeoutMs: runtime.timeoutMs },
    }, runtime);
    const seedUrl = seed.status === "success" && seed.data && typeof seed.data === "object"
      ? ((seed.data as { items?: Array<{ url?: string }> }).items?.[0]?.url ?? "unavailable-note")
      : "unavailable-note";
    const operations = await Promise.all([
      probeOperationHealth({ operation: searchOperation, router: this.#router, parameters: { query: "汽车用车体验", limit: 1 }, runtime }),
      probeOperationHealth({ operation: noteOperation, router: this.#router, parameters: { note: seedUrl }, runtime }),
      probeOperationHealth({ operation: commentsOperation, router: this.#router, parameters: { note: seedUrl, limit: 1 }, runtime }),
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

export const __test__ = { searchData, noteData, commentsData, noteId };
