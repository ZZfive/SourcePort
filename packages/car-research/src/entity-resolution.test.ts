import { describe, expect, it } from "vitest";

import { crossSourceMatch, exactSeriesMatches } from "./entity-resolution.js";

const dongchedi = {
  seriesId: "1",
  name: "车型 A（国产）",
  brand: "品牌",
  evidenceIds: ["dcd"],
};

describe("car series entity resolution", () => {
  it("matches only exact normalized brand and names", () => {
    expect(exactSeriesMatches("车型A(国产)", "品牌", [
      { seriesId: "2", name: "车型 A（国产）", brand: "品牌", evidenceIds: ["ah"] },
      { seriesId: "3", name: "车型A Pro", brand: "品牌", evidenceIds: ["other"] },
    ])).toHaveLength(1);
  });

  it("reports ambiguous exact identities as conflict", () => {
    expect(crossSourceMatch({
      dongchedi,
      autohomeMatches: [
        { seriesId: "2", name: dongchedi.name, brand: dongchedi.brand, evidenceIds: ["a"] },
        { seriesId: "3", name: dongchedi.name, brand: dongchedi.brand, evidenceIds: ["b"] },
      ],
    })).toEqual(expect.objectContaining({ status: "conflict" }));
  });
});
