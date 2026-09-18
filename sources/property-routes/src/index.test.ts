import { describe, expect, it } from "vitest";
import { PropertyRoutesAdapter, __test__ } from "./index.js";

describe("property routes source", () => {
  it("parses duration and distance without inventing missing values", () => {
    const route = __test__.parseRoute("<article>预计 1小时20分钟，距离 18.4 公里</article>", { url: "https://map.baidu.com/route", origin: "origin", destination: "destination", mode: "driving", departureWindow: "weekday-am" });
    expect(route).toEqual(expect.objectContaining({ durationMinutes: 80, distanceKm: 18.4, evidenceStatus: "source-verified", departureWindow: "weekday-am" }));
    const unresolved = __test__.parseRoute("<article>路线规划</article>", { url: "https://map.baidu.com/route", origin: "origin", destination: "destination", mode: "transit" });
    expect(unresolved).toEqual(expect.objectContaining({ evidenceStatus: "unresolved" }));
    expect(unresolved.durationMinutes).toBeUndefined();
  });

  it("only accepts allowlisted public map URLs", () => {
    expect(__test__.validUrl("https://map.baidu.com/route")).toBe(true);
    expect(__test__.validUrl("https://ditu.amap.com/route")).toBe(true);
    expect(__test__.validUrl("http://map.baidu.com/route")).toBe(false);
    expect(__test__.validUrl("https://example.com/route")).toBe(false);
  });

  it("routes verified evidence through public HTTP", async () => {
    const adapter = new PropertyRoutesAdapter({ fetch: async () => new Response("<title>路线</title><article>约 42 分钟，距离 12.5 公里</article>", { status: 200 }) });
    const result = await adapter.execute({ source: "property-routes", operation: "get-route-evidence", parameters: { url: "https://map.baidu.com/route", origin: "origin", destination: "destination", mode: "driving" } }, { now: () => new Date(), signal: new AbortController().signal });
    expect(result.status).toBe("success");
    expect(result.data).toEqual(expect.objectContaining({ durationMinutes: 42, evidenceStatus: "source-verified" }));
    expect(result.evidence[0]).toEqual(expect.objectContaining({ source: "property-routes", sourceUrl: "https://map.baidu.com/route" }));
  });
});
