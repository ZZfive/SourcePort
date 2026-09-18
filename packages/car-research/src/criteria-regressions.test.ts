import { describe, expect, it } from "vitest";
import type { CarCandidate, CarCriterion, DeliveryEvidence } from "./contracts.js";
import { compareCandidates, evaluateCriteria, type CriterionContext } from "./criteria.js";
const context: CriterionContext = {
  onRoadCost: { status: "unknown", components: [], missingComponents: [], reasons: [], evidenceIds: [] },
  drivingAssistance: null, budgetEvidenceIds: [], bodyStyleEvidenceIds: [], configurationEvidenceIds: ["config"],
};
const criterion = (requirement: unknown): CarCriterion => ({ key: "drivingAssistance.capabilities", label: "assistance", kind: "hard", priority: 100, requirement });
const entry = (key: string, label: string, availability: string) => ({ key, label, availability, value: availability === "standard" ? "标配" : null });
const navigation = {
  key: "navigation_assisted_driving", label: "导航辅助驾驶", value: null, availability: "standard",
  options: [entry("navigation_assisted_driving_2", "高快领航", "standard"), entry("navigation_assisted_driving_1", "城市领航", "standard")],
};
const evaluate = (names: string[], drivingAssistance: unknown) => evaluateCriteria([criterion(names)], { ...context, drivingAssistance })[0]!;

describe("nested exact-trim assistance evidence", () => {
  it("recognizes both navigation domains in recorded-style nested options and Chinese aliases", () => {
    const r = evaluate(["高速领航辅助", "城市NOA"], { capabilities: {}, operatingDomains: { highwayNavigation: navigation } });
    expect(r.status).toBe("pass"); expect(r.evidenceIds).toEqual(["config"]);
  });
  it("does not transfer highway navigation to urban navigation", () => {
    expect(evaluate(["城市领航"], { operatingDomains: { highwayNavigation: { ...navigation, options: navigation.options.slice(0, 1) } } }).status).toBe("unknown");
  });
  it("does not confuse lane keeping with lane centering or general ADAS with HUAWEI ADS", () => {
    expect(evaluate(["车道居中"], { capabilities: { lateral: [entry("lane_keeping_assist", "车道保持辅助系统", "standard")] } }).status).toBe("unknown");
    expect(evaluate(["HUAWEI ADS"], { capabilities: { lateral: [entry("adas", "ADAS", "standard")] } }).status).toBe("unknown");
  });
  it("keeps optional equipment unresolved instead of claiming that the base trim includes it", () => {
    const r = evaluate(["自动泊车"], { capabilities: { parking: [entry("auto_park_entry", "自动泊车入位", "optional")] } });
    expect(r.status).toBe("unknown"); expect(r.message).toContain("cost unresolved");
  });
  it("preserves contradictory evidence instead of accepting the first match", () => {
    expect(evaluate(["ACC"], { capabilities: { longitudinal: [entry("adaptive_cruise", "自适应巡航", "standard"), entry("adaptive_cruise", "自适应巡航", "unavailable")] } }).status).toBe("conflict");
  });
  it("retains per-capability results when one requested capability fails", () => {
    const r = evaluate(["ACC", "自动泊车"], { capabilities: { longitudinal: [entry("adaptive_cruise", "自适应巡航", "standard")], parking: [entry("auto_park_entry", "自动泊车入位", "unavailable")] } });
    expect(r.status).toBe("fail"); expect(r.details?.map((d) => d.status)).toEqual(["pass", "fail"]);
  });
});

const commitment: DeliveryEvidence = {
  id: "delivery-1", source: "dealer written quote", sourceUrl: "https://example.org/quote/1", retrievedAt: "2026-09-10T00:00:00Z", validUntil: "2026-09-20T00:00:00Z",
  market: "示例城市", seriesId: "1", trimId: "11", kind: "commitment", earliestDate: "2027-02-01", latestDate: "2027-02-05",
};
const deadline: CarCriterion = { key: "purchase.deliveryBefore", label: "delivery", kind: "hard", priority: 100, requirement: { date: "2027-02-05" } };
function delivery(items: DeliveryEvidence[]) {
  return evaluateCriteria([deadline], { ...context, delivery: { evidence: items, market: "示例城市", seriesId: "1", trimId: "11", now: "2026-09-12T00:00:00Z" } })[0]!;
}
describe("documented delivery windows", () => {
  it("accepts an applicable current commitment on the inclusive deadline", () => {
    expect(delivery([commitment])).toMatchObject({ status: "pass", evidenceIds: ["delivery-1"] });
  });
  it("rejects only when the entire committed window is after the deadline", () => {
    expect(delivery([{ ...commitment, earliestDate: "2027-02-06", latestDate: "2027-02-10" }]).status).toBe("fail");
  });
  it("keeps a window crossing the deadline unknown and conflicting commitments as conflict", () => {
    expect(delivery([{ ...commitment, latestDate: "2027-02-10" }]).status).toBe("unknown");
    expect(delivery([commitment, { ...commitment, id: "later", earliestDate: "2027-02-06", latestDate: "2027-02-10" }]).status).toBe("conflict");
  });
  it.each([
    { market: "上海" }, { trimId: "22" }, { seriesId: "2" }, { kind: "estimate" as const },
    { validUntil: "2026-09-11T00:00:00Z" }, { retrievedAt: "2026-09-13T00:00:00Z" },
  ])("ignores inapplicable, estimated or non-current evidence %j", (change) => {
    expect(delivery([{ ...commitment, ...change }]).status).toBe("unknown");
  });
  it("keeps absent commitments unknown", () => { expect(delivery([]).status).toBe("unknown"); });
  it("does not normalize impossible calendar dates into a different deadline", () => {
    expect(evaluateCriteria([{ ...deadline, requirement: { date: "2027-02-30" } }], context)[0]?.status).toBe("conflict");
  });
});


describe("partial capability preferences", () => {
  it("prefers more evidenced requested capabilities when both combined results fail", () => {
    const candidate = (id: string, acc: string): CarCandidate => ({
      candidateId: id, eligibility: "eligible", evidenceCompleteness: 1, sourceRatings: {},
      criterionResults: evaluateCriteria([{ ...criterion(["ACC", "自动泊车"]), kind: "preference" }], {
        ...context, drivingAssistance: { capabilities: { longitudinal: [entry("adaptive_cruise", "自适应巡航", acc)],
          parking: [entry("auto_park_entry", "自动泊车入位", "unavailable")] } },
      }),
    } as CarCandidate);
    const low = candidate("a-low", "unavailable"); const high = candidate("z-high", "standard");
    expect(low.criterionResults[0]?.status).toBe("fail"); expect(high.criterionResults[0]?.status).toBe("fail");
    expect(compareCandidates(high, low)).toBeLessThan(0);
  });
  it("retains reasons and evidence IDs for excluded delivery evidence", () => {
    expect(delivery([{ ...commitment, market: "上海" }])).toMatchObject({ status: "unknown", evidenceIds: ["delivery-1"] });
    expect(delivery([{ ...commitment, market: "上海" }]).message).toContain("different market");
  });
});
