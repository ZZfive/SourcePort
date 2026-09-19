import { describe, expect, it } from "vitest";
import { WuhanListingsAdapter, __test__ } from "./index.js";
import { validateOperationOutput } from "@sourceport/core";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("Wuhan listings source", () => {
  it("only accepts allowlisted HTTPS listing hosts", () => { expect(__test__.validUrl("https://wh.ke.com/wh/ershoufang/")).toBe(true); expect(__test__.validUrl("https://wh.fang.ke.com/loupan/")).toBe(true); expect(__test__.validUrl("http://wh.ke.com/")).toBe(false); expect(__test__.validUrl("https://example.com/")).toBe(false); });
  it("normalizes listing pages as lead-only observations", () => { const data = __test__.parseSearch('<a href="/wh/ershoufang/abc.html">示例小区 3室2厅 98.5㎡</a><span>145万</span>', "示例区域", "resale", "示例城市", "https://wh.ke.com/wh/ershoufang/", "2026-09-18T00:00:00Z", 5); expect(data.items[0]).toEqual(expect.objectContaining({ city: "示例城市", community: "示例小区", bedrooms: 3, livingRooms: 2, areaSqm: 98.5, evidenceStatus: "lead-only" })); expect(data.items[0]?.priceCny?.minimumCny).toBe(1450000); });
  it("registers search and detail operations", () => { const adapter = new WuhanListingsAdapter(); expect(adapter.operations().map(x => x.operation)).toEqual(["search-listings", "get-listing"]); });
  it("keeps the detail normalizer inside its output contract", async () => { const value = __test__.parseDetail('<a href="https://m.fang.com/xf/wuhan/1.htm">示例项目 3室1厅 90㎡</a><span>150万</span>', "new", "示例城市", "https://m.fang.com/xf/wuhan/1.htm", "2026-09-18T00:00:00Z"); expect(validateOperationOutput(value, __test__.detailOperation.outputSchema).ok).toBe(true); });
  it("extracts Beike new-house leads while excluding navigation links", () => { const value = __test__.parseSearch('<a href="/loupan/p_demo123">示例项目</a><span>总价 145-160万/套 建面 89-105㎡</span><a href="/loupan/">地图找房</a>', "武汉新房", "new", "武汉", "https://wh.fang.ke.com/", "2026-09-18T00:00:00Z", 5); expect(value.items).toHaveLength(1); expect(value.items[0]).toEqual(expect.objectContaining({ community: "示例项目", areaSqm: 89, priceCny: { minimumCny: 1450000, maximumCny: 1600000 } })); });
  it("extracts Beike resale leads only from structured listing links", () => { const value = __test__.parseSearch('<a href="/wh/ershoufang/123456.html">光谷示例小区 3室1厅 92㎡</a><span>155万</span><a href="/wh/ershoufang/search/">请输入小区或商圈名称</a>', "武汉二手房", "resale", "武汉", "https://m.ke.com/wh/ershoufang", "2026-09-18T00:00:00Z", 5); expect(value.items).toHaveLength(1); expect(value.items[0]).toEqual(expect.objectContaining({ community: "光谷示例小区", bedrooms: 3, livingRooms: 1, areaSqm: 92, priceCny: { minimumCny: 1550000, maximumCny: 1550000 } })); });

  it("falls back from public HTML to OpenCLI Markdown without mixing adjacent cards", async () => {
    const markdown = `# 房源列表
[
![房源图片](https://images.example.test/one.jpg)
精装修三房，随时看房

3室2厅/98.5m²/南 北/示例花园

满五年 精装修
145万14,720元/平
](https://m.ke.com/wh/ershoufang/123456.html?fb_expo_id=111)
[
![房源图片](https://images.example.test/two.jpg)
两房出售

2室1厅/76m²/南/另一小区

88万11,579元/平
](https://m.ke.com/wh/ershoufang/654321.html?fb_expo_id=222)
[地图找房](https://m.ke.com/wh/ershoufang/search/)
`;
    const directory = await mkdtemp(join(tmpdir(), "listing-opencli-"));
    try {
      const command = join(directory, "opencli.cjs");
      await writeFile(command, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(markdown)});\n`);
      await chmod(command, 0o755);
      const adapter = new WuhanListingsAdapter({ openCliCommand: command, fetch: async () => new Response("<html>navigation only</html>") });
      const result = await adapter.execute({ source: "wuhan-listings", operation: "search-listings", parameters: { url: "https://m.ke.com/wh/ershoufang", query: "test", city: "示例城市", kind: "resale", limit: 5 } }, { now: () => new Date(), signal: new AbortController().signal });
      expect(result.status).toBe("success");
      expect(result.backend).toBe("wuhan-listings-browser");
      const data = result.data as { items: Array<Record<string, unknown>> };
      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toMatchObject({ community: "示例花园", areaSqm: 98.5, bedrooms: 3, livingRooms: 2, priceCny: { minimumCny: 1450000, maximumCny: 1450000 }, sourceUrl: "https://m.ke.com/wh/ershoufang/123456.html", evidenceStatus: "lead-only" });
      expect(data.items[1]).toMatchObject({ community: "另一小区", areaSqm: 76, bedrooms: 2, livingRooms: 1, priceCny: { minimumCny: 880000, maximumCny: 880000 } });
      const changed = __test__.parseSearch(__test__.markdownToListingHtml(markdown.replace("fb_expo_id=111", "fb_expo_id=999").replace("145万", "140万")), "test", "resale", "示例城市", "https://m.ke.com/wh/ershoufang", "2026-09-19T00:00:00Z", 5);
      expect(changed.items[0]?.candidateId).toBe(data.items[0]?.candidateId);
      expect(result.diagnostics?.attempts).toEqual([expect.objectContaining({ backend: "wuhan-listings-public", status: "failed" }), expect.objectContaining({ backend: "wuhan-listings-browser", status: "success" })]);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
