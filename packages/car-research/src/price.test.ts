import { describe, expect, it } from "vitest";

import { calculateOnRoadCost, parsePriceRangeCny } from "./price.js";

describe("car research prices", () => {
  it("parses Chinese ten-thousand-yuan price ranges", () => {
    expect(parsePriceRangeCny("12.98-14.68万")).toEqual({
      minimumCny: 129800,
      maximumCny: 146800,
    });
  });

  it("keeps the total unknown when mandatory applicable evidence is missing", () => {
    const result = calculateOnRoadCost({
      market: "武汉",
      seriesId: "1",
      trimId: "11",
      vehicleReferencePrice: { minimumCny: 120000, maximumCny: 125000 },
      vehicleEvidenceIds: ["vehicle-reference"],
      costEvidence: [],
    });

    expect(result.status).toBe("unknown");
    expect(result.missingComponents).toEqual([
      "vehicle-price",
      "purchase-tax",
      "insurance",
      "registration",
    ]);
    expect(result.estimateRange).toEqual({ minimumCny: 120000, maximumCny: 125000 });
  });

  it("returns an auditable known range when all mandatory components exist", () => {
    const evidence = [
      ["vehicle", "vehicle-price", 120000, 125000],
      ["tax", "purchase-tax", 0, 0],
      ["insurance", "insurance", 5000, 6500],
      ["registration", "registration", 500, 500],
    ].map(([id, component, minimumCny, maximumCny]) => ({
      id: String(id),
      component: component as "vehicle-price" | "purchase-tax" | "insurance" | "registration",
      minimumCny: Number(minimumCny),
      maximumCny: Number(maximumCny),
      mandatory: true,
      source: "fixture",
      retrievedAt: "2026-07-25T00:00:00.000Z",
      market: "武汉",
      applicability: "fixture",
    }));

    const result = calculateOnRoadCost({
      market: "武汉",
      seriesId: "1",
      trimId: "11",
      vehicleEvidenceIds: [],
      costEvidence: evidence,
    });

    expect(result.status).toBe("known");
    expect(result.range).toEqual({ minimumCny: 125500, maximumCny: 132000 });
    expect(result.evidenceIds).toEqual(["vehicle", "tax", "insurance", "registration"]);
  });
});
