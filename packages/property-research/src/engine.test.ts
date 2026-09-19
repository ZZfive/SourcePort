import { describe, expect, it } from "vitest";
import { renderPropertyResearchMarkdown, researchProperties, type PropertyCandidateInput, type PropertyResearchBrief } from "./index.js";

const brief: PropertyResearchBrief = {
  query: "示例城市总包示例预算，新房和二手房，优先三室一厅",
  market: { city: "示例城市" },
  housingTypes: ["new", "resale"],
  budget: { maximumAllInCny: 2_000_000, basis: "all-in" },
  layout: { bedrooms: 3, livingRooms: 1 },
  commuteAnchors: [{ id: "destinationA", label: "通勤目的地 A" }, { id: "destinationB", label: "通勤目的地 B" }],
};

const candidates: PropertyCandidateInput[] = [
  { candidateId: "new-1", kind: "new", city: "示例城市", community: "甲小区", building: "1栋", unit: "1单元", room: "101", bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1_500_000, maximumCny: 1_500_000 }, commuteMinutes: { destinationA: 35, destinationB: 55 }, costEvidence: [{ id: "tax-1", component: "deed-tax", minimumCny: 15_000, maximumCny: 15_000, mandatory: true, source: "official", retrievedAt: "2026-09-18T00:00:00Z", applicability: "sample" }] },
  { candidateId: "resale-1", kind: "resale", city: "示例城市", community: "乙小区", bedrooms: 2, livingRooms: 1, purchasePrice: { minimumCny: 2_100_000, maximumCny: 2_100_000 }, commuteMinutes: { destinationA: 50, destinationB: 35 } },
];

describe("property research", () => {
  it("keeps new and resale candidates separate and reports missing cost evidence", async () => {
    const report = await researchProperties(brief, { candidates, now: () => new Date("2026-09-18T00:00:00Z") });
    expect(report.status).toBe("partial");
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]?.kind).toBe("new");
    expect(report.candidates[0]?.allInCost.status).toBe("estimate");
    expect(report.evidence.map((item) => item.id)).toContain("tax-1");
    expect(report.rejected[0]?.eligibility).toBe("rejected");
    expect(renderPropertyResearchMarkdown(report)).toContain("通勤目的地 A=35 分钟");
  });

  it("does not merge candidates without exact unit identity", async () => {
    const { building: _building, unit: _unit, room: _room, ...withoutUnit } = candidates[0]!;
    const report = await researchProperties(brief, { candidates: [candidates[0]!, { ...withoutUnit, candidateId: "new-2", community: "甲小区" }] });
    expect(report.coverage.deduplicatedCandidates).toBe(2);
  });

  it("reports valid candidates excluded by the requested market scope", async () => {
    const report = await researchProperties(brief, {
      candidates: [{ ...candidates[0]!, candidateId: "outside-city", city: "上海" }],
    });
    expect(report.coverage.inputCandidates).toBe(1);
    expect(report.coverage.exclusions).toEqual([{ candidateId: "outside-city", reason: "candidate city '上海' is outside market '示例城市'" }]);
  });

  it("keeps asking price separate from transaction price and total cost", async () => {
    const report = await researchProperties(brief, {
      candidates: [{ candidateId: "asking-only", kind: "resale", city: "示例城市", community: "挂牌小区", bedrooms: 3, livingRooms: 1, askingPrice: { minimumCny: 1_300_000, maximumCny: 1_300_000 } }],
    });
    const candidate = report.candidates[0]!;
    expect(candidate.askingPrice).toEqual({ minimumCny: 1_300_000, maximumCny: 1_300_000 });
    expect(candidate.purchasePrice).toBeUndefined();
    expect(candidate.allInCost.status).toBe("unknown");
    expect(candidate.financing.status).toBe("unknown");
    expect(candidate.criterionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterion: expect.objectContaining({ key: "budget.asking.maxCny" }), status: "pass" }),
      expect.objectContaining({ criterion: expect.objectContaining({ key: "budget.allIn.maxCny" }), status: "unknown" }),
    ]));
    expect(renderPropertyResearchMarkdown(report)).toContain("挂牌价：1300000–1300000 元（不是成交价）");
  });
});
