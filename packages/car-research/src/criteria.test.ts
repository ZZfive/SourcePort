import { describe, expect, it } from "vitest";

import { candidateEligibility, evaluateCriteria } from "./criteria.js";

describe("car criteria", () => {
  it("does not reject a hard criterion whose evidence is unknown", () => {
    const results = evaluateCriteria([{
      key: "budget.onRoad.maxCny",
      label: "15万落地",
      kind: "hard",
      priority: 10,
      requirement: { maxCny: 150000 },
    }], {
      onRoadCost: {
        status: "unknown",
        components: [],
        missingComponents: ["vehicle-price"],
        reasons: ["missing vehicle price"],
        evidenceIds: [],
      },
      drivingAssistance: null,
      budgetEvidenceIds: [],
      bodyStyleEvidenceIds: [],
      configurationEvidenceIds: [],
    });

    expect(results[0]?.status).toBe("unknown");
    expect(candidateEligibility(results)).toBe("needs-verification");
  });

  it("preserves unsupported criteria explicitly", () => {
    const results = evaluateCriteria([{
      key: "future.filter",
      label: "未来条件",
      kind: "preference",
      priority: 1,
      requirement: true,
    }], {
      onRoadCost: {
        status: "unknown",
        components: [],
        missingComponents: [],
        reasons: [],
        evidenceIds: [],
      },
      drivingAssistance: null,
      budgetEvidenceIds: [],
      bodyStyleEvidenceIds: [],
      configurationEvidenceIds: [],
    });

    expect(results[0]).toEqual(expect.objectContaining({ status: "unsupported" }));
  });
});
