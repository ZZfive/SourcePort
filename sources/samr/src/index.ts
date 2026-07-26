import { createHash, randomUUID } from "node:crypto";

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
  source: "samr",
  displayName: "State Administration for Market Regulation",
  version: "1.0.0",
  description: "Official SAMR notice search and detail acquisition",
} as const;

const categories = ["recall", "administrative-penalty", "quality-safety", "other"] as const;
type NoticeCategory = (typeof categories)[number];

const searchOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "search-notices",
  description: "Search official SAMR notices",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["query"],
    properties: {
      query: { type: "string", minLength: 1 },
      categories: { type: "array", maxItems: 4, items: { enum: categories } },
      limit: { type: "integer", minimum: 1, maximum: 20 },
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
          required: ["noticeId", "title", "url", "summary", "category"],
          properties: {
            noticeId: { type: "string", minLength: 1 },
            title: { type: "string", minLength: 1 },
            url: { type: "string", minLength: 1 },
            summary: { type: "string" },
            category: { enum: categories },
            publishedAt: { type: "string" },
          },
        },
      },
    },
  },
  backends: [
    { name: "samr-search-public", kind: "public-http", priority: 0 },
    { name: "samr-search-browser", kind: "opencli", priority: 1 },
    { name: "samr-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "none",
  freshnessClass: "volatile",
};

const noticeOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-notice",
  description: "Retrieve one official SAMR notice",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["url"],
    properties: { url: { type: "string", minLength: 1 } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["noticeId", "title", "department", "body", "url", "attachments"],
    properties: {
      noticeId: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      department: { type: "string" },
      body: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      publishedAt: { type: "string" },
      attachments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "url"],
          properties: { name: { type: "string" }, url: { type: "string" } },
        },
      },
    },
  },
  backends: [
    { name: "samr-notice-public", kind: "public-http", priority: 0 },
    { name: "samr-notice-browser", kind: "opencli", priority: 1 },
    { name: "samr-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "none",
  freshnessClass: "periodic",
};

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
}

function text(value: string): string {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(value: string, base = "https://www.samr.gov.cn/"): string {
  return new URL(value, base).toString();
}

function noticeId(url: string): string {
  return `sha256:${createHash("sha256").update(url).digest("hex")}`;
}

function categoryFor(value: string): NoticeCategory {
  if (/召回/.test(value)) return "recall";
  if (/处罚|罚款|行政执法/.test(value)) return "administrative-penalty";
  if (/质量|缺陷|安全/.test(value)) return "quality-safety";
  return "other";
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return undefined;
  const date = new Date(`${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function searchHtml(body: string, query: string, limit: number) {
  const items = [...body.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .flatMap((match) => {
      const title = text(match[2] ?? "");
      if (!title || title.length < 4) return [];
      const url = absoluteUrl(match[1] ?? "");
      if (!new URL(url).hostname.endsWith("samr.gov.cn") || !/\/art\/|content_|\/zw\//.test(url)) return [];
      const publishedAt = isoDate(title);
      return [{
        noticeId: noticeId(url),
        title,
        url,
        summary: "",
        category: categoryFor(title),
        ...(publishedAt ? { publishedAt } : {}),
      }];
    })
    .filter((item, index, all) => all.findIndex((candidate) => candidate.url === item.url) === index)
    .slice(0, limit);
  if (items.length === 0) throw new Error("SAMR search page did not expose static result links");
  return { query, items };
}

function searchBrowser(value: unknown, query: string, limit: number) {
  if (!Array.isArray(value)) throw new Error("SAMR browser search did not return an array");
  const items = value.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const record = row as Record<string, unknown>;
    const title = String(record["title"] ?? "").trim();
    const rawUrl = String(record["url"] ?? "").trim();
    if (!title || !rawUrl) return [];
    let url: URL;
    try { url = new URL(rawUrl); } catch { return []; }
    if (!url.hostname.endsWith("samr.gov.cn")) return [];
    return [{
      noticeId: noticeId(url.toString()),
      title,
      url: url.toString(),
      summary: String(record["snippet"] ?? "").trim(),
      category: categoryFor(`${title} ${String(record["snippet"] ?? "")}`),
    }];
  }).slice(0, limit);
  if (items.length === 0) throw new Error("SAMR browser search returned no official URLs");
  return { query, items };
}

function meta(body: string, names: readonly string[]): string | undefined {
  for (const name of names) {
    const pattern = new RegExp(`<meta\\b[^>]*(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, "i");
    const reverse = new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, "i");
    const value = body.match(pattern)?.[1] ?? body.match(reverse)?.[1];
    if (value) return text(value);
  }
  return undefined;
}

function noticeHtml(body: string, url: string) {
  const title = meta(body, ["ArticleTitle", "ContentTitle", "og:title"]) ??
    text(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const publishedAt = isoDate(meta(body, ["PubDate", "MakeTime", "ArticleTime"]) ?? body);
  const department = meta(body, ["Department", "Source", "Author"]) ?? "";
  const contentMatch = body.match(/<(?:article|div)\b[^>]*(?:class|id)=["'][^"']*(?:content|article|TRS_Editor)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|div)>/i);
  const bodyText = text(contentMatch?.[1] ?? body).slice(0, 20_000);
  const chineseCharacters = bodyText.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const scriptLike = /(?:for\s*\(let|function\s*\(|document\.|html\s*\+=|window\.)/i.test(bodyText);
  if (!title || bodyText.length < 20 || chineseCharacters < 10 || scriptLike) {
    throw new Error("SAMR notice lacked a stable title or article body");
  }
  const attachments = [...body.matchAll(/<a\b[^>]*href=["']([^"']+\.(?:pdf|docx?|xlsx?)(?:\?[^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ name: text(match[2] ?? ""), url: absoluteUrl(match[1] ?? "", url) }));
  return {
    noticeId: noticeId(url),
    title,
    department,
    ...(publishedAt ? { publishedAt } : {}),
    body: bodyText,
    url,
    attachments,
  };
}

function browserNotice(value: unknown, url: string) {
  if (typeof value === "string") return noticeHtml(value, url);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const markdown = String(record["markdown"] ?? record["content"] ?? "");
    if (markdown) return noticeHtml(`<title>${String(record["title"] ?? "SAMR notice")}</title><article>${markdown}</article>`, url);
  }
  throw new Error("SAMR browser reader did not return page content");
}

function validSamrUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.endsWith("samr.gov.cn");
  } catch {
    return false;
  }
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

export class SamrAdapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(options: { fetch?: typeof fetch; openCliCommand?: string } = {}) {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "Accept-Language": "zh-CN,zh;q=0.9",
    };
    this.#router = new BackendRouter([
      new PublicHttpBackend({
        name: "samr-search-public",
        request: ({ request }) => {
          const query = String((request.parameters as Record<string, unknown>)["query"]);
          return `https://www.samr.gov.cn/search/?q=${encodeURIComponent(query)}`;
        },
        init: () => ({ redirect: "follow", headers }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        classify: ({ body }) => /验证码|访问验证|captcha/i.test(body)
          ? {
              status: "blocked" as const,
              code: "human_verification_required" as const,
              message: "SAMR requires access verification",
              recoveryActions: [humanVerificationRecovery("Complete SAMR access verification in a browser")],
            }
          : undefined,
        classifyError: ({ error }) => ({
          status: "failed",
          code: "source_drift",
          message: error instanceof Error ? error.message : "SAMR search parser failed",
          retryable: true,
        }),
        parse: ({ body, context }) => {
          const parameters = context.request.parameters as Record<string, unknown>;
          return searchHtml(body, String(parameters["query"]), Number(parameters["limit"] ?? 8));
        },
      }),
      new OpenCliBackend({
        name: "samr-search-browser",
        ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => {
          const parameters = request.parameters as Record<string, unknown>;
          const categoryTerms = Array.isArray(parameters["categories"])
            ? (parameters["categories"] as string[]).map((category) => ({
                recall: "召回",
                "administrative-penalty": "处罚",
                "quality-safety": "质量 安全",
                other: "",
              })[category] ?? "").filter(Boolean).join(" ")
            : "";
          return [
            "brave",
            "search",
            `site:samr.gov.cn ${String(parameters["query"])} ${categoryTerms}`.trim(),
            "--limit",
            String(parameters["limit"] ?? 8),
          ];
        },
        parse: (data, context) => {
          const parameters = context.request.parameters as Record<string, unknown>;
          return searchBrowser(data, String(parameters["query"]), Number(parameters["limit"] ?? 8));
        },
      }),
      new PublicHttpBackend({
        name: "samr-notice-public",
        request: ({ request }) => String((request.parameters as Record<string, unknown>)["url"]),
        init: () => ({ redirect: "follow", headers }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        classify: ({ body }) => /验证码|访问验证|captcha/i.test(body)
          ? {
              status: "blocked" as const,
              code: "human_verification_required" as const,
              message: "SAMR requires access verification",
              recoveryActions: [humanVerificationRecovery("Complete SAMR access verification in a browser")],
            }
          : undefined,
        classifyError: ({ error }) => ({
          status: "failed",
          code: "source_drift",
          message: error instanceof Error ? error.message : "SAMR notice parser failed",
          retryable: true,
        }),
        parse: ({ body, context }) => noticeHtml(body, String((context.request.parameters as Record<string, unknown>)["url"])),
      }),
      new OpenCliBackend({
        name: "samr-notice-browser",
        ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => [
          "web", "read",
          "--url", String((request.parameters as Record<string, unknown>)["url"]),
          "--stdout", "true",
          "--download-images", "false",
          "--wait", "1",
        ],
        parse: (data, context) => browserNotice(data, String((context.request.parameters as Record<string, unknown>)["url"])),
      }),
      new ManualStepBackend({ name: "samr-manual", description: "Open the official SAMR notice in a browser and retry" }),
    ]);
  }

  manifest() { return manifest; }
  operations() { return [searchOperation, noticeOperation]; }

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
    if (descriptor.operation === noticeOperation.operation) {
      const url = String((validation.value.parameters as Record<string, unknown>)["url"]);
      if (!validSamrUrl(url)) return invalid(request, descriptor, "get-notice requires an https://*.samr.gov.cn URL");
    }
    return this.#router.execute(validation.value, descriptor);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const operations = await Promise.all([
      probeOperationHealth({ operation: searchOperation, router: this.#router, parameters: { query: "汽车召回", categories: ["recall"], limit: 1 }, runtime }),
      probeOperationHealth({ operation: noticeOperation, router: this.#router, parameters: { url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/" }, runtime }),
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

export const __test__ = { searchHtml, searchBrowser, noticeHtml, validSamrUrl };
