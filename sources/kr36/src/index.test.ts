import { describe, expect, it } from "vitest";

import { __test__ } from "./index.js";

describe("36kr normalization", () => {
  it("normalizes search and article field rows", () => {
    expect(__test__.searchData([
      { rank: 1, title: "Article", date: "2026-07-26", url: "https://36kr.com/p/1" },
    ], "query").items[0]?.publishedAt).toContain("2026-07-25T16:00:00.000Z");
    expect(__test__.articleData([
      { field: "title", value: "Article" },
      { field: "author", value: "Author" },
      { field: "body", value: "Body" },
      { field: "url", value: "https://36kr.com/p/1" },
    ], "1").articleId).toBe("1");
  });

  it("rejects empty search and incomplete article bodies", () => {
    expect(() => __test__.searchData([], "query")).toThrow("no usable rows");
    expect(() => __test__.articleData([{ field: "title", value: "Article" }], "1"))
      .toThrow("lacked stable identity");
  });
});
