import { describe, expect, it } from "vitest";

import { parseDongchediSeriesPage } from "./get-series.js";

const html = `<script id="__NEXT_DATA__">${JSON.stringify({
  page: "/auto/new_series",
  props: {
    pageProps: {
      seriesId: "5273",
      seriesHomeHead: {
        series_id: 5273,
        series_name: "宝马X5",
        brand_name: "宝马",
        sub_brand_name: "华晨宝马",
        has_official_price: true,
        official_price: "59.80-74.80万",
        has_dealer_price: true,
        dealer_price: "52.80-65.50万",
        sh_low_Price: "31.20",
        sh_high_price: "61.80",
      },
      scoreSimpleInfo: { score: 441, total_review_count: 1234 },
      rankData: {
        sale: { rank_name: "中大型SUV销量榜", list: [{ rank: 8 }] },
        score: { rank_name: "懂车分榜", list: [{ rank: 3 }] },
      },
      carModelsData: {
        tab_list: [
          {
            tab_key: "online_all",
            data: [
              { info: { car_id: 255925 } },
              { info: { car_id: 255926 } },
              { info: { name: "group heading" } },
            ],
          },
        ],
      },
    },
  },
})}</script>`;

describe("Dongchedi get-series", () => {
  it("returns a stable series overview", () => {
    expect(parseDongchediSeriesPage(html, "5273")).toEqual({
      seriesId: "5273",
      name: "宝马X5",
      brand: "宝马",
      subBrand: "华晨宝马",
      officialPrice: "59.80-74.80万",
      dealerPrice: "52.80-65.50万",
      usedPrice: "31.20-61.80万",
      score: 4.41,
      reviewCount: 1234,
      saleRank: "中大型SUV销量榜 第8名",
      scoreRank: "懂车分榜 第3名",
      onSaleTrimCount: 2,
      sourceUrl: "https://www.dongchedi.com/auto/series/5273",
    });
  });

  it("fails closed when the series identity differs", () => {
    expect(() => parseDongchediSeriesPage(html, "1")).toThrow(/series identity/);
  });
});
