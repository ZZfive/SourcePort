import { describe, expect, it } from "vitest";

import { parseDongchediOwnerReviewsPage } from "./get-owner-reviews.js";

const html = `<script id="__NEXT_DATA__">${JSON.stringify({
  page: "/auto/series/score/[id]",
  props: {
    pageProps: {
      reviewListData: {
        review_list: [
          {
            gid_str: "7399912345678901234",
            user_info: { name: "武汉车主" },
            buy_car_info: { year: 2025, car_name: "xDrive30Li M运动套装" },
            score_info: { score: 438 },
            digg_count_en: 28,
            comment_count_en: 6,
            content: "空间和底盘表现符合预期，高速辅助驾驶使用稳定。",
          },
          {
            gid: 7399912345678901235n.toString(),
            user_info: { name: "第二位车主" },
            car_name: "xDrive40Li",
            score_info: { score: 420 },
            content: "第二条评价",
          },
        ],
      },
    },
  },
})}</script>`;

describe("Dongchedi get-owner-reviews", () => {
  it("returns bounded owner reviews with stable article identities", () => {
    const result = parseDongchediOwnerReviewsPage(html, "5273", 1);

    expect(result).toEqual({
      seriesId: "5273",
      items: [
        {
          reviewId: "7399912345678901234",
          rank: 1,
          userDisplayName: "武汉车主",
          trim: "2025 xDrive30Li M运动套装",
          score: 4.38,
          likes: 28,
          comments: 6,
          excerpt: "空间和底盘表现符合预期，高速辅助驾驶使用稳定。",
          sourceUrl: "https://www.dongchedi.com/ugc/article/7399912345678901234",
        },
      ],
    });
  });

  it("fails closed on an empty review list", () => {
    const empty = `<script id="__NEXT_DATA__">${JSON.stringify({
      props: { pageProps: { reviewListData: { review_list: [] } } },
    })}</script>`;
    expect(() => parseDongchediOwnerReviewsPage(empty, "5273", 5)).toThrow(
      /no owner reviews/,
    );
  });
});
