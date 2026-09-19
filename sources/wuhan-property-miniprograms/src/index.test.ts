import { describe, expect, it } from "vitest";
import { WuhanPropertyMiniProgramsAdapter, __test__ } from "./index.js";

describe("Wuhan property mini-program observations", () => {
  it("normalizes a claimed observation and preserves its share reference", async () => {
    const adapter = new WuhanPropertyMiniProgramsAdapter();
    const result = await adapter.execute({ source: "wuhan-property-miniprograms", operation: "record-observation", parameters: { candidateId: "candidate-1", program: "wuchang-housing-market", channel: "wechat-mini-program", city: "武汉", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z", shareRef: "wechat://mini-program/example", areaSqm: 92, bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 } } }, { now: () => new Date("2026-09-19T01:00:00Z"), signal: new AbortController().signal });
    expect(result.status).toBe("success");
    expect(result.data).toEqual(expect.objectContaining({ evidenceStatus: "claimed", candidateId: "candidate-1", areaSqm: 92, purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 }, priceKind: "asking" }));
    expect(result.evidence[0]).toEqual(expect.objectContaining({ sourceId: "wechat://mini-program/example", verification: "claimed" }));
  });

  it("requires a share reference or source URL before recording an observation", async () => {
    const adapter = new WuhanPropertyMiniProgramsAdapter();
    const result = await adapter.execute({ source: "wuhan-property-miniprograms", operation: "record-observation", parameters: { candidateId: "candidate-1", program: "wufang-service", channel: "manual-export", city: "武汉", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z" } }, { now: () => new Date("2026-09-19T01:00:00Z"), signal: new AbortController().signal });
    expect(result.status).toBe("blocked");
    expect(result.recoveryActions.some((item) => item.kind === "complete_human_verification")).toBe(true);
  });

  it("keeps the operation output contract explicit", () => {
    expect(__test__.observationOperation.parametersSchema).toEqual(expect.objectContaining({ additionalProperties: false }));
  });

  it("requires an explicit price kind for non-asking observations", () => {
    expect(__test__.observation({ candidateId: "candidate-1", program: "other", channel: "manual-export", city: "武汉", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z", purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 }, priceKind: "transaction" })).toEqual(expect.objectContaining({ priceKind: "transaction" }));
  });
});
