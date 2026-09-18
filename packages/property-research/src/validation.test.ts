import { describe, expect, it } from "vitest";
import { calculateAllInCost } from "./finance.js";
import { validatePropertyCandidates, validatePropertyResearchBrief } from "./validation.js";

const brief = {
  query: "示例城市买房",
  market: { city: "示例城市" },
  housingTypes: ["new", "resale"],
  budget: { maximumAllInCny: 2_000_000, basis: "all-in" },
  commuteAnchors: [{ id: "a", label: "通勤目的地 A" }],
};

describe("property contracts", () => {
  it("rejects unknown fields and duplicate anchor IDs", () => {
    const unknown = validatePropertyResearchBrief({ ...brief, unexpected: true });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.issues.some(x => x.path.endsWith("unexpected"))).toBe(true);
    const duplicate = validatePropertyResearchBrief({ ...brief, commuteAnchors: [{ id: "a", label: "A" }, { id: "a", label: "B" }] });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.issues.some(x => x.path === "commuteAnchors")).toBe(true);
  });

  it("rejects duplicate candidate IDs and dangling evidence references", () => {
    const result = validatePropertyCandidates([
      { candidateId: "same", kind: "new", city: "示例城市", community: "甲", fieldEvidence: { price: ["missing"] } },
      { candidateId: "same", kind: "resale", city: "示例城市", community: "乙" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(x => x.message.includes("candidateId"))).toBe(true);
    if (!result.ok) expect(result.issues.some(x => x.message.includes("unresolved evidence"))).toBe(true);
  });

  it("does not count stale or unverified cost evidence as a verified total", () => {
    const result = calculateAllInCost({ market: "示例城市", candidateIds: ["p"], now: new Date("2026-09-18T00:00:00Z"), costEvidence: [{ id: "old", component: "deed-tax", minimumCny: 100, maximumCny: 100, mandatory: true, source: "listing", sourceUrl: "https://example.com/old", retrievedAt: "2025-01-01T00:00:00Z", validUntil: "2025-02-01T00:00:00Z", candidateId: "p", market: "示例城市", applicability: "old", verification: "source-verified" }] });
    expect(result.status).toBe("unknown");
    expect(result.excludedEvidence[0]?.reason).toContain("stale");
  });
});
