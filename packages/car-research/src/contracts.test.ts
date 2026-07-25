import { describe, expect, it } from "vitest";

import { validateCarResearchBrief } from "./contracts.js";

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
      limits: { exactConfigurations: 7 },
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(expect.objectContaining({
      path: "limits.exactConfigurations",
    }));
  });
});
