import { randomUUID } from "node:crypto";
import {
  aggregateSourceHealth, BackendRouter, createFailure, humanVerificationRecovery,
  ManualStepBackend, OpenCliBackend, probeOperationHealth, PublicHttpBackend,
  type OperationDescriptor, type SourceAdapter, type SourceHealthRuntime,
  type SourceRequest, type SourceResult, type SourceRuntime, validateSourceRequest,
} from "@sourceport/core";

const manifest = {
  source: "wuhan-listings",
  displayName: "Wuhan property listing leads",
  version: "1.0.0",
  description: "Bounded new and resale listing discovery; listing leads are not title or transaction proof",
} as const;

export type ListingKind = "new" | "resale";
export interface ListingLead {
  candidateId: string;
  kind: ListingKind;
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
export interface ListingSearchData { query: string; kind: ListingKind; items: ListingLead[]; }
export interface ListingDetailData extends ListingLead { description?: string; }

const searchOperation: OperationDescriptor = {
  source: manifest.source, operation: "search-listings", description: "Search bounded Wuhan new or resale listing leads", access: "read", schemaVersion: "1.0.0",
  parametersSchema: { type: "object", additionalProperties: false, required: ["url", "query", "kind", "city"], properties: { url: { type: "string", minLength: 1 }, query: { type: "string", minLength: 1 }, kind: { enum: ["new", "resale"] }, city: { type: "string", minLength: 1 }, limit: { type: "integer", minimum: 1, maximum: 30 } } },
  outputSchema: { type: "object", additionalProperties: false, required: ["query", "kind", "items"], properties: { query: { type: "string" }, kind: { enum: ["new", "resale"] }, items: { type: "array", items: { type: "object", additionalProperties: false, required: ["candidateId", "kind", "city", "community", "title", "sourceUrl", "retrievedAt", "evidenceStatus"], properties: { candidateId: { type: "string" }, kind: { enum: ["new", "resale"] }, city: { type: "string", minLength: 1 }, community: { type: "string" }, title: { type: "string" }, sourceUrl: { type: "string" }, retrievedAt: { type: "string" }, priceCny: { type: "object" }, areaSqm: { type: "number" }, bedrooms: { type: "integer" }, livingRooms: { type: "integer" }, district: { type: "string" }, evidenceStatus: { const: "lead-only" } } } } } },
  backends: [{ name: "wuhan-listings-public", kind: "public-http", priority: 0 }, { name: "wuhan-listings-browser", kind: "opencli", priority: 1 }, { name: "wuhan-listings-manual", kind: "manual-step", priority: 99 }], auth: "optional", freshnessClass: "volatile",
};
const detailOperation: OperationDescriptor = {
  source: manifest.source, operation: "get-listing", description: "Retrieve one bounded Wuhan listing lead", access: "read", schemaVersion: "1.0.0",
  parametersSchema: { type: "object", additionalProperties: false, required: ["url", "kind", "city"], properties: { url: { type: "string", minLength: 1 }, kind: { enum: ["new", "resale"] }, city: { type: "string", minLength: 1 } } },
  outputSchema: { type: "object", additionalProperties: false, required: ["candidateId", "kind", "city", "community", "title", "sourceUrl", "retrievedAt", "evidenceStatus"], properties: { candidateId: { type: "string" }, kind: { enum: ["new", "resale"] }, city: { type: "string", minLength: 1 }, community: { type: "string" }, title: { type: "string" }, sourceUrl: { type: "string" }, retrievedAt: { type: "string" }, description: { type: "string" }, priceCny: { type: "object" }, areaSqm: { type: "number" }, bedrooms: { type: "integer" }, livingRooms: { type: "integer" }, district: { type: "string" }, evidenceStatus: { const: "lead-only" } } },
  backends: [{ name: "wuhan-listings-public", kind: "public-http", priority: 0 }, { name: "wuhan-listings-browser", kind: "opencli", priority: 1 }, { name: "wuhan-listings-manual", kind: "manual-step", priority: 99 }], auth: "optional", freshnessClass: "volatile",
};

const allowedHosts = new Set(["wh.ke.com", "m.ke.com", "www.ke.com", "wh.fang.ke.com", "wh.fang.com", "wuhan.fang.com", "m.fang.com"]);
function validUrl(value: string): boolean { try { const url = new URL(value); return url.protocol === "https:" && allowedHosts.has(url.hostname); } catch { return false; } }
function clean(value: string): string { return value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim(); }
function sha(value: string): string { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return `lead:${(hash >>> 0).toString(16)}`; }
function number(value: string | undefined): number | undefined { if (!value) return undefined; const result = Number(value.replace(/,/g, "")); return Number.isFinite(result) ? result : undefined; }
function markdownToListingHtml(markdown: string): string {
  // OpenCLI web read emits Markdown even with -f json. Remove image links first
  // so nested image labels cannot be mistaken for listing-card boundaries.
  const withoutImages = markdown.replace(/!\[[^\]]*\]\([^\n]*?\)/g, "");
  const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return [...withoutImages.matchAll(/\[([^\[\]]+)\]\((https?:\/\/[^\s)]+)\)/g)]
    .map(match => `<a href="${escape(match[2] ?? "")}">${escape(match[1] ?? "")}</a>`).join("\n");
}
function extract(text: string, kind: ListingKind, city: string, url: string, retrievedAt: string, limit: number): ListingLead[] {
  const items: ListingLead[] = [];
  const seen = new Set<string>();
  const links = [...text.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of links) {
    const title = clean(match[2] ?? "");
    if (title.length < 4) continue;
    let resolved: URL;
    try { resolved = new URL((match[1] ?? "").replace(/&amp;/g, "&"), url); } catch { continue; }
    resolved.searchParams.delete("fb_expo_id");
    const sourceUrl = resolved.toString();
    if (!validUrl(sourceUrl)) continue;
    const end = (match.index ?? 0) + match[0].length;
    const following = text.slice(end).split(/<a\b/i, 1)[0] ?? "";
    const nearby = clean(`${match[2] ?? ""} ${following.slice(0, 350)}`);
    const cardCommunity = (match[2] ?? "").match(/[1-6]室\s*[0-3]厅\s*\/\s*[\d.]+\s*(?:m²|m2|㎡)\s*\/[^/\n]+\/([^\n<]+)/i)?.[1]?.trim();
    const community = cardCommunity ?? (title.replace(/\s*(?:[1-6]室|四室|三室|两室|一室).*$/u, "").trim() || title.slice(0, 32));
    const id = sha(sourceUrl);
    if (seen.has(id)) continue;
    const priceRange = nearby.match(/(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*万/);
    const price = nearby.match(/(\d+(?:\.\d+)?)\s*万/);
    const areaRange = nearby.match(/(\d+(?:\.\d+)?)\s*[-~至]\s*(\d+(?:\.\d+)?)\s*(?:㎡|平方米|m²|m2)/i);
    const area = nearby.match(/(\d+(?:\.\d+)?)\s*(?:㎡|平方米|m²|m2)/i);
    const layout = nearby.match(/([1-6])室\s*([0-3])厅/);
    const path = new URL(sourceUrl).pathname;
    const isStructuredListing = kind === "resale"
      ? /\/ershoufang\/(?:[^/]+\/)?[^/]+\.html$/i.test(path) || /\/xf\/wuhan\/\d+\.htm$/i.test(path)
      : /\/loupan\/p_[^/]+/i.test(path) || /\/xf\/wuhan\/\d+\.htm$/i.test(path);
    if (!isStructuredListing || (!price && !area && !layout && !/\d+\.html$/.test(path))) continue;
    const parsedArea = number(areaRange?.[1] ?? area?.[1]);
    const parsedPrice = number(priceRange?.[1] ?? price?.[1]);
    const parsedPriceMaximum = number(priceRange?.[2] ?? price?.[1]);
    const item: ListingLead = { candidateId: id, kind, city, community, title, sourceUrl, retrievedAt, evidenceStatus: "lead-only", ...(parsedPrice === undefined ? {} : { priceCny: { minimumCny: parsedPrice * 10000, maximumCny: (parsedPriceMaximum ?? parsedPrice) * 10000 } }), ...(parsedArea === undefined ? {} : { areaSqm: parsedArea }), ...(layout ? { bedrooms: Number(layout[1]), livingRooms: Number(layout[2]) } : {}) };
    items.push(item); seen.add(id); if (items.length >= limit) break;
  }
  if (!items.length) throw new Error("listing page exposed no stable listing leads");
  return items;
}
function parseSearch(body: string, query: string, kind: ListingKind, city: string, url: string, retrievedAt: string, limit: number): ListingSearchData { return { query, kind, items: extract(body, kind, city, url, retrievedAt, limit) }; }
function parseDetail(body: string, kind: ListingKind, city: string, url: string, retrievedAt: string): ListingDetailData { const items = extract(body, kind, city, url, retrievedAt, 30); const first = items.find(item => item.sourceUrl === url); if (!first || /我要卖房|我要出租|找经纪人|找小区|找学校|租房|房天下|我的房天下|房地产|房贷计算器|装修|商铺|写字楼|土地|数据|资讯|百科|直播|房产问答|房产知识|探房|买房|购房|看房|海外房产/.test(first.title)) throw new Error("listing detail did not expose an exact property identity"); return { ...first, description: clean(body).slice(0, 5000) }; }
function invalid(request: SourceRequest, descriptor: OperationDescriptor, message: string): SourceResult { return { requestId: request.requestId ?? randomUUID(), source: request.source, operation: request.operation, operationSchemaVersion: descriptor.schemaVersion, status: "failed", evidence: [], warnings: [], failure: createFailure("invalid_request", message, "validation"), recoveryActions: [] }; }

export class WuhanListingsAdapter implements SourceAdapter {
  readonly #router: BackendRouter;
  constructor(options: { fetch?: typeof fetch; openCliCommand?: string } = {}) {
    const headers = { "User-Agent": "Mozilla/5.0 SourcePort/1.0", "Accept-Language": "zh-CN,zh;q=0.9" };
    const backendOptions = () => ({
      name: `wuhan-listings-public`, request: ({ request }: { request: SourceRequest }) => String((request.parameters as Record<string, unknown>)["url"]), init: () => ({ redirect: "follow" as const, headers }), ...(options.fetch ? { fetch: options.fetch } : {}),
      classify: ({ body }: { body: string }) => /验证码|访问验证|captcha/i.test(body) ? { status: "blocked" as const, code: "human_verification_required" as const, message: "listing source requires access verification", recoveryActions: [humanVerificationRecovery("Complete the listing site verification in a browser")] } : undefined,
      classifyError: ({ error }: { error: unknown }) => ({ status: "failed" as const, code: "source_drift" as const, message: error instanceof Error ? error.message : "listing parser failed", retryable: true }),
      parse: ({ body, context }: { body: string; context: { request: SourceRequest } }) => { const p = context.request.parameters as Record<string, unknown>; const kind = p["kind"] as ListingKind; const city = String(p["city"]); const url = String(p["url"]); const retrievedAt = new Date().toISOString(); return context.request.operation === searchOperation.operation ? parseSearch(body, String(p["query"]), kind, city, url, retrievedAt, Number(p["limit"] ?? 20)) : parseDetail(body, kind, city, url, retrievedAt); },
    });
    this.#router = new BackendRouter([new PublicHttpBackend(backendOptions()), new OpenCliBackend({ name: "wuhan-listings-browser", ...(options.openCliCommand ? { command: options.openCliCommand } : {}), outputFormat: "text", args: ({ request }) => ["web", "read", "--url", String((request.parameters as Record<string, unknown>)["url"]), "--stdout", "true", "--download-images", "false", "--wait", "1"], parse: (data, context) => { const p = context.request.parameters as Record<string, unknown>; const value = typeof data === "string" ? data : data && typeof data === "object" ? String((data as Record<string, unknown>)["content"] ?? (data as Record<string, unknown>)["markdown"] ?? "") : ""; const city = String(p["city"]); const url = String(p["url"]); const retrievedAt = new Date().toISOString(); return context.request.operation === searchOperation.operation ? parseSearch(markdownToListingHtml(value), String(p["query"]), p["kind"] as ListingKind, city, url, retrievedAt, Number(p["limit"] ?? 20)) : parseDetail(markdownToListingHtml(value), p["kind"] as ListingKind, city, url, retrievedAt); } }), new ManualStepBackend({ name: "wuhan-listings-manual", description: "Open the listing search page in a browser and retry" })]);
  }
  manifest() { return manifest; }
  operations() { return [searchOperation, detailOperation]; }
  async execute(request: SourceRequest, _runtime: SourceRuntime): Promise<SourceResult> { const descriptor = this.operations().find(x => x.operation === request.operation); if (!descriptor) return invalid(request, searchOperation, `Unsupported operation '${request.operation}'`); const validation = validateSourceRequest(request, descriptor.parametersSchema); if (!validation.ok) return { ...invalid(request, descriptor, validation.failure.message), failure: validation.failure, warnings: validation.issues.map(x => ({ code: "validation_issue", message: x.message, field: x.path })) }; const url = String((validation.value.parameters as Record<string, unknown>)["url"]); if (!validUrl(url)) return invalid(request, descriptor, "listing URL must be HTTPS on an allowlisted Wuhan listing host"); return this.#router.execute(validation.value, descriptor); }
  async health(runtime: SourceHealthRuntime) { const startedAt = runtime.now(); const checkedAt = startedAt.toISOString(); const operations = await Promise.all([probeOperationHealth({ operation: searchOperation, router: this.#router, parameters: { url: "https://wuhan.fang.com/", query: "property listings", kind: "new", city: "configured-market", limit: 1 }, runtime }), probeOperationHealth({ operation: detailOperation, router: this.#router, parameters: { url: "https://wuhan.fang.com/", kind: "new", city: "configured-market" }, runtime })]); return aggregateSourceHealth({ source: manifest.source, displayName: manifest.displayName, checkedAt, durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()), operations }); }
}

export const __test__ = { extract, validUrl, parseSearch, parseDetail, markdownToListingHtml, searchOperation, detailOperation };
