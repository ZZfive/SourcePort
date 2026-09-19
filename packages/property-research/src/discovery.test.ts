import { describe, expect, it } from "vitest";
import { discoverPropertyCandidates, validatePropertyDiscoveryRequests } from "./discovery.js";

describe("property discovery route enrichment", () => {
  it("allows a mini-program observation to use a share reference without a web URL", () => {
    expect(validatePropertyDiscoveryRequests([{ source: "wuhan-property-miniprograms", operation: "record-observation", parameters: { candidateId: "candidate-1", program: "wufang-service", channel: "wechat-mini-program", city: "示例城市", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z", shareRef: "wechat://example" } }]).ok).toBe(true);
  });

  it("attaches route evidence to the candidate discovered earlier in the request list", async () => {
    const result = await discoverPropertyCandidates([
      { source: "listings", operation: "search-listings", parameters: { url: "https://listing.example/search", query: "示例区域", kind: "new", city: "示例城市" } },
      { source: "property-routes", operation: "get-route-evidence", parameters: { url: "https://map.baidu.com/route", candidateId: "listings:new:lead-1", anchorId: "office", origin: "小区", destination: "办公点", mode: "transit" } },
    ], {
      execute: async (request) => request.operation === "search-listings"
        ? { requestId: "listing", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { query: "示例区域", kind: "new", items: [{ candidateId: "lead-1", kind: "new", city: "示例城市", community: "示例小区", title: "示例小区", sourceUrl: "https://listing.example/lead-1", retrievedAt: "2026-09-18T00:00:00Z", evidenceStatus: "lead-only" }] }, evidence: [{ id: "listing-evidence", source: "listings", operation: request.operation, backend: "fixture", retrievedAt: "2026-09-18T00:00:00Z", verification: "source-verified" }], warnings: [], recoveryActions: [] }
        : { requestId: "route", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { candidateId: "listings:new:lead-1", anchorId: "office", durationMinutes: 37, evidenceStatus: "source-verified" }, evidence: [{ id: "route-evidence", source: "property-routes", operation: request.operation, backend: "fixture", retrievedAt: "2026-09-18T00:00:00Z", verification: "source-verified" }], warnings: [], recoveryActions: [] },
    });
    expect(result.status).toBe("success");
    expect(result.candidates[0]).toEqual(expect.objectContaining({ commuteMinutes: { office: 37 }, commuteEvidence: { office: ["route-evidence"] } }));
    expect(result.candidates[0]?.evidence?.map((item) => item.id)).toContain("route-evidence");
  });

  it("enriches a candidate from a claimed mini-program observation and keeps provenance", async () => {
    const result = await discoverPropertyCandidates([
      { source: "listings", operation: "search-listings", parameters: { url: "https://listing.example/search", query: "示例区域", kind: "resale", city: "示例城市" } },
      { source: "wuhan-property-miniprograms", operation: "record-observation", parameters: { candidateId: "listings:resale:lead-1", program: "wuchang-housing-market", channel: "manual-export", city: "示例城市", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z", shareRef: "wechat://example", areaSqm: 92, bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 }, evidenceStatus: "claimed" } },
    ], {
      execute: async (request) => request.operation === "search-listings"
        ? { requestId: "listing", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { query: "示例区域", kind: "resale", items: [{ candidateId: "lead-1", kind: "resale", city: "示例城市", community: "示例小区", title: "示例小区", sourceUrl: "https://listing.example/lead-1", retrievedAt: "2026-09-19T00:00:00Z", evidenceStatus: "lead-only" }] }, evidence: [{ id: "listing-evidence", source: "listings", operation: request.operation, backend: "fixture", retrievedAt: "2026-09-19T00:00:00Z", verification: "source-verified" }], warnings: [], recoveryActions: [] }
        : { requestId: "observation", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { candidateId: "listings:resale:lead-1", program: "wuchang-housing-market", channel: "manual-export", city: "示例城市", kind: "resale", community: "示例小区", observedAt: "2026-09-19T00:00:00Z", shareRef: "wechat://example", areaSqm: 92, bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 }, evidenceStatus: "claimed" }, evidence: [{ id: "mini-program-evidence", source: "wuhan-property-miniprograms", operation: request.operation, backend: "manual-observation", retrievedAt: "2026-09-19T00:00:00Z", verification: "claimed" }], warnings: [], recoveryActions: [] },
    });
    expect(result.candidates[0]).toEqual(expect.objectContaining({ areaSqm: 92, bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1500000, maximumCny: 1500000 } }));
    expect(result.candidates[0]?.evidence?.map((item) => item.id)).toContain("mini-program-evidence");
  });
});
