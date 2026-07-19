import { describe, expect, it } from "vitest";

import { parseDongchediTrimsPage } from "./list-trims.js";

const html = `<script id="__NEXT_DATA__">${JSON.stringify({
  page: "/auto/new_series",
  props: {
    pageProps: {
      seriesId: "5273",
      carModelsData: {
        tab_list: [
          {
            tab_key: "online_all",
            tab_text: "在售",
            data: [
              { info: { name: "2026款-宝马X5" } },
              {
                info: {
                  car_id: 255925,
                  name: "改款 xDrive30Li 尊享型M运动曜夜套装",
                  year: 2026,
                  official_price: 59.8,
                  dealer_price: "52.80万",
                  owner_price: "51.50万",
                },
              },
            ],
          },
        ],
      },
    },
  },
})}</script>`;

describe("Dongchedi list-trims", () => {
  it("returns stable exact-trim identities and configuration URLs", () => {
    expect(parseDongchediTrimsPage(html, "5273", "online")).toEqual({
      seriesId: "5273",
      status: "online",
      items: [
        {
          trimId: "255925",
          name: "改款 xDrive30Li 尊享型M运动曜夜套装",
          year: "2026",
          officialPrice: "59.8万",
          dealerPrice: "52.80万",
          ownerPrice: "51.50万",
          sourceUrl: "https://www.dongchedi.com/auto/series/5273/model-255925",
          configurationUrl: "https://www.dongchedi.com/auto/params-carIds-255925",
        },
      ],
    });
  });

  it("fails closed when the series identity does not match", () => {
    expect(() => parseDongchediTrimsPage(html, "999", "online")).toThrow(
      /series identity/,
    );
  });
});
