import { describe, expect, it } from "vitest";

import { MAX_RESEARCH_LIMITS, effectiveCriteria, validateCarResearchBrief, type CarResearchBrief } from "./contracts.js";

describe("CarResearchBrief", () => {
  it("preserves open-ended criteria instead of rejecting unknown keys", () => {
    const input = {
      query: "test",
      market: { city: "武汉" },
      criteria: [{
        key: "future.unmodeled.filter",
        label: "未来条件",
        kind: "preference",
        priority: 1,
        requirement: { anything: true },
      }],
      seeds: [{ kind: "series", name: "车型A" }],
    };

    const result = validateCarResearchBrief(input);

    expect(result.ok).toBe(true);
    expect(result.value?.criteria[0]?.key).toBe("future.unmodeled.filter");
  });

  it("rejects evidence budgets above the bounded maxima", () => {
    const result = validateCarResearchBrief({
      query: "test",
      market: { city: "武汉" },
      criteria: [],
      seeds: [{ kind: "series", name: "车型A" }],
      limits: { exactConfigurations: MAX_RESEARCH_LIMITS.exactConfigurations + 1 },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: "limits.exactConfigurations",
    }));
  });
});

const brief: CarResearchBrief = { query: "test", market: { city: "武汉" }, criteria: [], seeds: [{ kind: "series", name: "车型A" }] };
describe("discovery and delivery input contracts", () => {
  it("requires dated, attributable release leads", () => {
    expect(validateCarResearchBrief({ ...brief, discovery: { leads: [{ name: "新品", brand: "品牌" }] } }).ok).toBe(false);
    expect(validateCarResearchBrief({ ...brief, discovery: { leads: [{ name: "新品", brand: "品牌", source: "manufacturer", sourceUrl: "https://example.org/release", retrievedAt: "2026-09-10T00:00:00Z", marketStatus: "presale" }] } }).ok).toBe(true);
  });
  it("rejects malformed delivery windows and impossible calendar dates", () => {
    expect(validateCarResearchBrief({ ...brief, deliveryEvidence: [{ id: "delivery" }] }).ok).toBe(false);
    expect(validateCarResearchBrief({ ...brief, purchaseTiming: { targetDate: "2027-02-30" } }).ok).toBe(false);
  });
  it("converts convenience deadline and on-road ceiling to explicit hard criteria", () => {
    expect(effectiveCriteria({ ...brief, purchaseTiming: { targetDate: "2027-02-05" }, budget: { maximumCny: 150000, basis: "on-road" } }).map((item) => [item.key, item.kind]))
      .toEqual([["purchase.deliveryBefore", "hard"], ["budget.onRoad.maxCny", "hard"]]);
  });
});


describe("criterion identity and convenience consistency", () => {
  const budget = { key: "budget.onRoad.maxCny", label: "budget", kind: "hard", priority: 100, requirement: { maxCny: 150000 } };
  it("rejects duplicate keys rather than silently picking one", () => {
    expect(validateCarResearchBrief({ ...brief, criteria: [budget, budget] }).ok).toBe(false);
  });
  it("rejects conflicting or weakened convenience constraints", () => {
    expect(validateCarResearchBrief({ ...brief, criteria: [budget], budget: { maximumCny: 160000, basis: "on-road" } }).ok).toBe(false);
    expect(validateCarResearchBrief({ ...brief, criteria: [{ ...budget, kind: "preference" }], budget: { maximumCny: 150000, basis: "on-road" } }).ok).toBe(false);
    expect(validateCarResearchBrief({ ...brief, criteria: [budget], budget: { maximumCny: 150000, basis: "on-road" } }).ok).toBe(true);
  });
});


describe("cost input evidence integrity", () => {
  const cost = { id: "quote", component: "vehicle-price", minimumCny: 100000, maximumCny: 100000,
    mandatory: true, source: "dealer", applicability: "Wuhan", retrievedAt: "2026-09-10T00:00:00Z" };
  it.each([{ minimumCny: "100000" }, { maximumCny: null }, { appliesTo: { trimId: 0 } }, { market: "" }])(
    "rejects coercible prices and malformed scope %j", (change) => {
      expect(validateCarResearchBrief({ ...brief, costEvidence: [{ ...cost, ...change }] }).ok).toBe(false);
    });
  it("rejects cost and delivery provenance collisions", () => {
    expect(validateCarResearchBrief({ ...brief, costEvidence: [cost], deliveryEvidence: [{
      id: "quote", source: "dealer", sourceUrl: "https://example.org/quote", retrievedAt: cost.retrievedAt,
      validUntil: "2026-09-20T00:00:00Z", market: "武汉", trimId: "11", kind: "commitment",
      earliestDate: "2026-09-15", latestDate: "2026-09-20",
    }] }).ok).toBe(false);
  });
});
