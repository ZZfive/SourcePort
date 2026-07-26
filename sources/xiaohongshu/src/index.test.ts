import { describe, expect, it } from "vitest";

import { __test__ } from "./index.js";

describe("Xiaohongshu normalization", () => {
  const url = "https://www.xiaohongshu.com/explore/697f6c740000000000000000";

  it("normalizes notes and excludes nested replies", () => {
    expect(__test__.searchData([{ title: "体验", author: "车主", url, likes: "3", published_at: "2026-02-01" }], "query").items[0]?.noteId)
      .toBe("697f6c740000000000000000");
    expect(__test__.commentsData([
      { rank: 1, author: "A", text: "top", likes: "1", is_reply: false },
      { rank: 2, author: "B", text: "reply", likes: "0", is_reply: true },
    ], url).items).toHaveLength(1);
  });

  it("rejects missing or deleted notes and enforces the comment limit", () => {
    expect(() => __test__.noteData([], url)).toThrow("lacked title and author");
    expect(__test__.commentsData([
      { rank: 1, author: "A", text: "one", likes: "1" },
      { rank: 2, author: "B", text: "two", likes: "1" },
    ], url, 1).items).toHaveLength(1);
  });
});
