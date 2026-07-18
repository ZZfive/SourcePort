import { describe, expect, it } from "vitest";

import { parseAutohomeSeriesScore } from "./get-series-score.js";

const scoreHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
  props: {
    pageProps: {
      baseData: {
        seriesname: "宝马X5",
        brandName: "宝马",
        levelname: "中大型SUV",
        pricerange: "59.80-74.80",
        average: "4.41",
        seriesScoreList: [
          { typeName: "空间", score: 4.91 },
          { typeName: "驾驶感受", score: 4.75 },
        ],
        cmpSeriesScore: [
          { seriesId: 8529, seriesName: "问界M6", score: "4.60" },
        ],
      },
      qualityData: { pph: 69, userCount: 49 },
    },
  },
})}</script>`;

describe("Autohome get-series-score", () => {
  it("parses aggregate, dimensions, reliability, and competitors", () => {
    expect(parseAutohomeSeriesScore(scoreHtml, "6548")).toEqual({
      seriesId: "6548",
      name: "宝马X5",
      brand: "宝马",
      level: "中大型SUV",
      guidePrice: "59.80-74.80万",
      overallScore: 4.41,
      dimensions: [
        { name: "空间", score: 4.91 },
        { name: "驾驶感受", score: 4.75 },
      ],
      reliability: { pph: 69, reviewUsers: 49 },
      competitors: [{ seriesId: "8529", name: "问界M6", score: 4.6 }],
      sourceUrl: "https://k.autohome.com.cn/6548",
    });
  });

  it("fails closed when baseData is absent", () => {
    expect(() =>
      parseAutohomeSeriesScore(
        `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: {} } })}</script>`,
        "6548",
      ),
    ).toThrow(/baseData/);
  });
});
