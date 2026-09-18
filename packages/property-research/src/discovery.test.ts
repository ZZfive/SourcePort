import { describe, expect, it } from "vitest";
import { discoverPropertyCandidates } from "./discovery.js";

describe("property discovery route enrichment", () => {
  it("attaches route evidence to the candidate discovered earlier in the request list", async () => {
    const result = await discoverPropertyCandidates([
      { source: "listings", operation: "search-listings", parameters: { url: "https://listing.example/search", query: "示例区域", kind: "new", city: "示例城市" } },
      { source: "property-routes", operation: "get-route-evidence", parameters: { url: "https://map.baidu.com/route", candidateId: "listings:lead-1", anchorId: "office", origin: "小区", destination: "办公点", mode: "transit" } },
    ], {
      execute: async (request) => request.operation === "search-listings"
        ? { requestId: "listing", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { query: "示例区域", kind: "new", items: [{ candidateId: "lead-1", kind: "new", city: "示例城市", community: "示例小区", title: "示例小区", sourceUrl: "https://listing.example/lead-1", retrievedAt: "2026-09-18T00:00:00Z", evidenceStatus: "lead-only" }] }, evidence: [{ id: "listing-evidence", source: "listings", operation: request.operation, backend: "fixture", retrievedAt: "2026-09-18T00:00:00Z", verification: "source-verified" }], warnings: [], recoveryActions: [] }
        : { requestId: "route", source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data: { candidateId: "listings:lead-1", anchorId: "office", durationMinutes: 37, evidenceStatus: "source-verified" }, evidence: [{ id: "route-evidence", source: "property-routes", operation: request.operation, backend: "fixture", retrievedAt: "2026-09-18T00:00:00Z", verification: "source-verified" }], warnings: [], recoveryActions: [] },
    });
    expect(result.status).toBe("success");
    expect(result.candidates[0]).toEqual(expect.objectContaining({ commuteMinutes: { office: 37 }, commuteEvidence: { office: ["route-evidence"] } }));
    expect(result.candidates[0]?.evidence?.map((item) => item.id)).toContain("route-evidence");
  });
});
