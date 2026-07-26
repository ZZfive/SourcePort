import { describe, expect, it } from "vitest";

import { __test__ } from "./index.js";

describe("SAMR parsing", () => {
  it("parses static search links and notice content", () => {
    const search = __test__.searchHtml(
      '<a href="/zw/zfxxgk/fdzdgknr/zlfzs/art/2026/art_test.html">某汽车召回公告</a>',
      "某汽车",
      8,
    );
    expect(search.items[0]?.category).toBe("recall");
    const notice = __test__.noticeHtml(
      '<html><head><meta name="ArticleTitle" content="召回公告"><meta name="MakeTime" content="2026-07-26"></head><body><article class="content">这是召回公告正文，涉及特定生产批次并提供整改方案。</article></body></html>',
      search.items[0]!.url,
    );
    expect(notice.title).toBe("召回公告");
    expect(notice.body).toContain("特定生产批次");
  });

  it("normalizes dynamic search rows and preserves notice attachments", () => {
    const search = __test__.searchBrowser([
      { title: "质量安全公告", url: "https://www.samr.gov.cn/zw/art/2026/art_dynamic.html", snippet: "涉及汽车质量" },
    ], "汽车", 8);
    expect(search.items[0]?.category).toBe("quality-safety");
    const notice = __test__.noticeHtml(
      '<html><head><meta name="ArticleTitle" content="质量公告"></head><body><article class="content">这是足够长的质量公告正文，用于验证附件提取能力。</article><a href="/files/batch.pdf">批次附件</a></body></html>',
      search.items[0]!.url,
    );
    expect(notice.attachments).toEqual([{ name: "批次附件", url: "https://www.samr.gov.cn/files/batch.pdf" }]);
  });

  it("reports parser drift for pages without official result links", () => {
    expect(() => __test__.searchHtml("<html>changed</html>", "汽车", 8)).toThrow("did not expose static result links");
    expect(() => __test__.noticeHtml(
      "<html><title>国家市场监督管理总局政务服务平台-召回</title><body><script>for (let i = 0; i < 10; i++) { html += value[i].title; }</script></body></html>",
      "https://www.samr.gov.cn/zw/portal",
    )).toThrow("stable title or article body");
  });

  it("rejects non-SAMR detail URLs", () => {
    expect(__test__.validSamrUrl("https://example.com/article")).toBe(false);
  });
});
