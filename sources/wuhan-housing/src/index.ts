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
  source: "wuhan-housing",
  displayName: "Wuhan official housing sources",
  version: "1.0.0",
  description: "Bounded official Wuhan housing, presale, transaction, and provident-fund evidence",
} as const;

const allowedHosts = new Set([
  "zgj.wuhan.gov.cn",
  "gjj.wuhan.gov.cn",
  "www.wuhan.gov.cn",
  "spfxm.whfgxx.org.cn",
]);

export interface WuhanOfficialPage {
  title: string;
  body: string;
  url: string;
  topic: "presale-permit" | "mortgage" | "policy" | "other";
  publishedAt?: string;
}

const pageOperation: OperationDescriptor = {
  source: manifest.source,
  operation: "get-official-page",
  description: "Retrieve one allowlisted Wuhan official housing page",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["url"],
    properties: {
      url: { type: "string", minLength: 1 },
      topic: { enum: ["presale-permit", "mortgage", "policy", "other"] },
    },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["title", "body", "url", "topic"],
    properties: {
      title: { type: "string", minLength: 1 },
      body: { type: "string", minLength: 1 },
      url: { type: "string", minLength: 1 },
      topic: { enum: ["presale-permit", "mortgage", "policy", "other"] },
      publishedAt: { type: "string" },
    },
  },
  backends: [
    { name: "wuhan-housing-public", kind: "public-http", priority: 0 },
    { name: "wuhan-housing-browser", kind: "opencli", priority: 1 },
    { name: "wuhan-housing-manual", kind: "manual-step", priority: 99 },
  ],
  auth: "none",
  freshnessClass: "periodic",
};

function text(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/(20\d{2})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!match) return undefined;
  const date = new Date(`${match[1]}-${match[2]!.padStart(2, "0")}-${match[3]!.padStart(2, "0")}T00:00:00+08:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

function validWuhanUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

function topic(value: unknown): WuhanOfficialPage["topic"] {
  return value === "presale-permit" || value === "mortgage" || value === "policy" || value === "other" ? value : "other";
}

function parsePage(body: string, url: string, requestedTopic: unknown): WuhanOfficialPage {
  const title = meta(body, ["ArticleTitle", "ContentTitle", "og:title"]) ?? text(body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const main = body.match(/<(?:article|main|div)\b[^>]*(?:class|id)=["'][^"']*(?:content|article|TRS_Editor|正文|zwgk)[^"']*["'][^>]*>([\s\S]*?)<\/(?:article|main|div)>/i)?.[1] ?? body;
  const bodyText = text(main).slice(0, 30_000);
  const publishedAt = isoDate(meta(body, ["PubDate", "ArticleTime", "MakeTime"]) ?? bodyText.match(/20\d{2}[年./-]\d{1,2}[月./-]\d{1,2}/)?.[0]);
  if (!title || bodyText.length < 20) throw new Error("Wuhan official page lacked a stable title or body");
  return { title, body: bodyText, url, topic: topic(requestedTopic), ...(publishedAt ? { publishedAt } : {}) };
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

export class WuhanHousingAdapter implements SourceAdapter {
  readonly #router: BackendRouter;

  constructor(options: { fetch?: typeof fetch; openCliCommand?: string } = {}) {
    const headers = { "User-Agent": "Mozilla/5.0 SourcePort/1.0", "Accept-Language": "zh-CN,zh;q=0.9" };
    this.#router = new BackendRouter([
      new PublicHttpBackend<WuhanOfficialPage>({
        name: "wuhan-housing-public",
        request: ({ request }) => String((request.parameters as Record<string, unknown>)["url"]),
        init: () => ({ redirect: "follow", headers }),
        ...(options.fetch ? { fetch: options.fetch } : {}),
        classify: ({ body }) => /验证码|访问验证|captcha/i.test(body)
          ? { status: "blocked" as const, code: "human_verification_required" as const, message: "Wuhan official source requires access verification", recoveryActions: [humanVerificationRecovery("Complete Wuhan official site verification in a browser")] }
          : undefined,
        classifyError: ({ error }) => ({ status: "failed" as const, code: "source_drift" as const, message: error instanceof Error ? error.message : "Wuhan official page parser failed", retryable: true }),
        parse: ({ body, context }) => {
          const parameters = context.request.parameters as Record<string, unknown>;
          return parsePage(body, String(parameters["url"]), parameters["topic"]);
        },
      }),
      new OpenCliBackend({
        name: "wuhan-housing-browser",
        ...(options.openCliCommand ? { command: options.openCliCommand } : {}),
        jsonOutput: true,
        args: ({ request }) => ["web", "read", "--url", String((request.parameters as Record<string, unknown>)["url"]), "--stdout", "true", "--download-images", "false", "--wait", "1"],
        parse: (data, context) => {
          const parameters = context.request.parameters as Record<string, unknown>;
          const value = typeof data === "string" ? data : data && typeof data === "object" ? String((data as Record<string, unknown>)["markdown"] ?? (data as Record<string, unknown>)["content"] ?? "") : "";
          if (!value) throw new Error("Wuhan browser reader returned no page content");
          return parsePage(`<title>Wuhan official page</title><article>${value}</article>`, String(parameters["url"]), parameters["topic"]);
        },
      }),
      new ManualStepBackend({ name: "wuhan-housing-manual", description: "Open the Wuhan official page in a browser and retry" }),
    ]);
  }

  manifest() { return manifest; }
  operations() { return [pageOperation]; }

  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> {
    const descriptor = this.operations().find((item) => item.operation === request.operation);
    if (!descriptor) return invalid(request, pageOperation, `Unsupported operation '${request.operation}'`);
    const validation = validateSourceRequest(request, descriptor.parametersSchema);
    if (!validation.ok) return { ...invalid(request, descriptor, validation.failure.message), failure: validation.failure, warnings: validation.issues.map((issue) => ({ code: "validation_issue", message: issue.message, field: issue.path })) };
    const url = String((validation.value.parameters as Record<string, unknown>)["url"]);
    if (!validWuhanUrl(url)) return invalid(request, descriptor, "get-official-page requires an https URL on an allowlisted Wuhan official host");
    return this.#router.execute(validation.value, descriptor);
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const operations = await probeOperationHealth({ operation: pageOperation, router: this.#router, parameters: { url: "https://gjj.wuhan.gov.cn/bsfw/ywzl/ywzn/dkyw/202412/t20241219_2504837.html", topic: "mortgage" }, runtime });
    return aggregateSourceHealth({ source: manifest.source, displayName: manifest.displayName, checkedAt, durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()), operations: [operations] });
  }
}

export const __test__ = { parsePage, validWuhanUrl };
