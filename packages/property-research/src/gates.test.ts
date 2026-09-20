import { describe, expect, it } from "vitest";
import { assessPropertyWorkflow, propertyIdentityStatus } from "./gates.js";
import { calculateAllInCost } from "./finance.js";

const identity = { city: "示例城市", community: "示例小区", building: "1栋", unit: "1单元", room: "101" };

describe("property identity and contract gates", () => {
  it("distinguishes leads, community-bound and exact-unit candidates", () => {
    expect(propertyIdentityStatus({ candidateId: "lead", kind: "resale", city: "示例城市", community: "示例小区" })).toBe("community-bound");
    expect(propertyIdentityStatus({ candidateId: "unit", kind: "resale", ...identity })).toBe("unit-bound");
    expect(propertyIdentityStatus({ candidateId: "conflict", kind: "resale", ...identity, observations: [{ candidateId: "other", kind: "resale", ...identity, room: "102" }] })).toBe("identity-conflict");
  });

  it("keeps a generic policy and missing loan proof from passing the contract gate", () => {
    const candidate = { candidateId: "unit", kind: "resale" as const, ...identity, purchasePrice: { minimumCny: 1_000_000, maximumCny: 1_000_000 }, evidence: [], checkEvidence: [] };
    const result = assessPropertyWorkflow(candidate, { query: "q", market: { city: "示例城市" }, housingTypes: ["resale"], budget: { maximumAllInCny: 2_000_000, basis: "all-in" }, commuteAnchors: [], financing: { mode: "commercial", downPaymentRatios: [0.5], annualRates: [0.03], termsMonths: [360] } }, calculateAllInCost({ market: "示例城市", candidateIds: [candidate.candidateId], purchasePrice: candidate.purchasePrice, costEvidence: [] }), new Date("2026-09-20T00:00:00Z"));
    expect(result.loanEligibility.status).toBe("unknown");
    expect(result.gates.find(gate => gate.phase === "contract")?.status).toBe("paused");
  });
});
