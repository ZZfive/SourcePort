import { describe, expect, it } from "vitest";
import { WuhanListingsAdapter, __test__ } from "./index.js";
import { validateOperationOutput } from "@sourceport/core";

describe("Wuhan listings source", () => {
  it("only accepts allowlisted HTTPS listing hosts", () => { expect(__test__.validUrl("https://wh.ke.com/wh/ershoufang/")).toBe(true); expect(__test__.validUrl("http://wh.ke.com/")).toBe(false); expect(__test__.validUrl("https://example.com/")).toBe(false); });
  it("normalizes listing pages as lead-only observations", () => { const data = __test__.parseSearch('<a href="/wh/ershoufang/abc.html">示例小区 3室2厅 98.5㎡</a><span>145万</span>', "示例区域", "resale", "示例城市", "https://wh.ke.com/wh/ershoufang/", "2026-09-18T00:00:00Z", 5); expect(data.items[0]).toEqual(expect.objectContaining({ city: "示例城市", community: "示例小区", bedrooms: 3, livingRooms: 2, areaSqm: 98.5, evidenceStatus: "lead-only" })); expect(data.items[0]?.priceCny?.minimumCny).toBe(1450000); });
  it("registers search and detail operations", () => { const adapter = new WuhanListingsAdapter(); expect(adapter.operations().map(x => x.operation)).toEqual(["search-listings", "get-listing"]); });
  it("keeps the detail normalizer inside its output contract", async () => { const value = __test__.parseDetail('<a href="https://m.fang.com/xf/wuhan/1.htm">示例项目 3室1厅 90㎡</a><span>150万</span>', "new", "示例城市", "https://m.fang.com/xf/wuhan/1.htm", "2026-09-18T00:00:00Z"); expect(validateOperationOutput(value, __test__.detailOperation.outputSchema).ok).toBe(true); });
});
