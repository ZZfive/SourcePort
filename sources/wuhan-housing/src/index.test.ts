import { describe, expect, it } from "vitest";
import { WuhanHousingAdapter, __test__ } from "./index.js";

describe("Wuhan housing source", () => {
  it("only accepts allowlisted official HTTPS hosts", () => {
    expect(__test__.validWuhanUrl("https://zgj.wuhan.gov.cn/page.html")).toBe(true);
    expect(__test__.validWuhanUrl("https://gjj.wuhan.gov.cn/page.html")).toBe(true);
    expect(__test__.validWuhanUrl("https://zrzyhgh.wuhan.gov.cn/page.html")).toBe(true);
    expect(__test__.validWuhanUrl("http://zgj.wuhan.gov.cn/page.html")).toBe(false);
    expect(__test__.validWuhanUrl("https://example.com/page.html")).toBe(false);
  });

  it("parses official HTML into bounded evidence data", () => {
    const page = __test__.parsePage("<html><head><title>贷款指南</title></head><body><article>发布日期：2026年04月24日。武汉住房公积金贷款指南正文。</article></body></html>", "https://gjj.wuhan.gov.cn/page.html", "mortgage");
    expect(page).toEqual(expect.objectContaining({ title: "贷款指南", topic: "mortgage", publishedAt: "2026-04-23T16:00:00.000Z" }));
  });

  it("prefers official metadata over a generic HTML title", () => {
    const page = __test__.parsePage("<head><title>generic</title><meta name=\"ArticleTitle\" content=\"住房公积金贷款指南\"><meta name=\"PubDate\" content=\"2026-04-24 17:11\"></head><article>武汉官方贷款政策正文，内容包含申请条件、贷款额度和办理流程。</article>", "https://gjj.wuhan.gov.cn/page.html", "mortgage");
    expect(page.title).toBe("住房公积金贷款指南");
    expect(page.publishedAt).toBe("2026-04-23T16:00:00.000Z");
  });

  it("marks exact-property evidence unresolved when the document does not name the property", () => {
    const document = __test__.parsePropertyDocument(
      "<title>预售公告</title><article>官方公告正文，但没有候选项目名称。</article>",
      { candidateId: "candidate-1", propertyRef: "目标项目", url: "https://zgj.wuhan.gov.cn/permit.html", topic: "presale-permit" },
    );
    expect(document).toEqual(expect.objectContaining({ candidateId: "candidate-1", propertyRef: "目标项目", identityMatch: "unresolved", evidenceStatus: "unresolved" }));
  });

  it("marks exact-property evidence source-verified when the document names the property", () => {
    const document = __test__.parsePropertyDocument(
      "<title>目标项目预售许可</title><article>目标项目 预售许可证号：示例号。</article>",
      { candidateId: "candidate-1", propertyRef: "目标项目", url: "https://zgj.wuhan.gov.cn/permit.html", topic: "presale-permit" },
    );
    expect(document).toEqual(expect.objectContaining({ identityMatch: "matched", evidenceStatus: "source-verified" }));
  });

  it("exposes the official page operation", () => {
    const adapter = new WuhanHousingAdapter({ fetch: async () => new Response("<title>官方页面</title><article>武汉住房政策正文足够长。</article>", { status: 200, headers: { "content-type": "text/html" } }) });
    expect(adapter.manifest().source).toBe("wuhan-housing");
    expect(adapter.operations().map((operation) => operation.operation)).toEqual(["get-official-page", "get-property-document"]);
  });

  it("routes a valid official page through public HTTP and preserves evidence", async () => {
    const adapter = new WuhanHousingAdapter({ fetch: async () => new Response("<title>预售许可说明</title><article>武汉市住房和城市更新局发布的预售许可查询说明，发布日期：2026年04月24日。</article>", { status: 200 }) });
    const result = await adapter.execute({ source: "wuhan-housing", operation: "get-official-page", parameters: { url: "https://zgj.wuhan.gov.cn/help.html", topic: "presale-permit" } }, { now: () => new Date(), signal: new AbortController().signal });
    expect(result.status).toBe("success");
    expect(result.data).toEqual(expect.objectContaining({ topic: "presale-permit" }));
    expect(result.evidence[0]).toEqual(expect.objectContaining({ source: "wuhan-housing", sourceUrl: "https://zgj.wuhan.gov.cn/help.html" }));
  });

  it("rejects non-official URLs before any backend is called", async () => {
    const adapter = new WuhanHousingAdapter({ fetch: async () => { throw new Error("must not fetch"); } });
    const result = await adapter.execute({ source: "wuhan-housing", operation: "get-official-page", parameters: { url: "https://example.com/page.html" } }, { now: () => new Date(), signal: new AbortController().signal });
    expect(result.failure?.code).toBe("invalid_request");
  });
});
