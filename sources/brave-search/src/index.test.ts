import { describe, expect, it } from "vitest";

import { __test__, BraveSearchAdapter } from "./index.js";

describe("Brave Search normalization", () => {
  it("normalizes browser and API rows", () => {
    expect(__test__.normalizeRows([
      { rank: 1, title: "Recall", url: "https://example.com/1", snippet: "detail" },
    ], "query").items).toHaveLength(1);
    expect(__test__.apiData({ web: { results: [
      { title: "Notice", url: "https://example.com/2", description: "body" },
    ] } }, "query").items[0]?.snippet).toBe("body");
  });

  it("registers browser fallback without a key and API priority when configured", () => {
    expect(new BraveSearchAdapter({ apiKey: null }).operations()[0]?.backends.map((backend) => backend.name))
      .toEqual(["brave-browser", "brave-manual"]);
    expect(new BraveSearchAdapter({ apiKey: "fixture" }).operations()[0]?.backends[0]?.name)
      .toBe("brave-api");
  });
});
