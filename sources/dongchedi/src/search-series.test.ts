import { describe, expect, it } from "vitest";

import {
  classifyDongchediSearchPage,
  parseDongchediSearchApiResponse,
  parseDongchediSearchPage,
} from "./search-series.js";

const validHtml = `<!doctype html><html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
  props: {
    pageProps: {
      searchData: {
        return_count: 2,
        data: [
          {
            cell_type: 26,
            series_id: 5273,
            display: {
              series_name: "宝马X5",
              sub_brand_name: "华晨宝马",
              official_price: "59.80-74.80万",
              agent_price: "51.00-68.00万",
              picture_num: 11355,
            },
          },
          { cell_type: 200, series_id: null, display: {} },
          {
            cell_type: 26,
            series_id: 6548,
            display: {
              title: "宝马X5(进口)",
              sub_brand_name: "宝马(进口)",
              official_price: "69.99-80.99万",
              agent_price: "63.99-73.99万",
              picture_num: 8000,
            },
          },
        ],
      },
    },
  },
})}</script></body></html>`;

describe("Dongchedi search-series parsing", () => {
  it("parses the current authenticated SSR shape for the find-car tab", () => {
    const data = parseDongchediSearchPage(`<script id="__NEXT_DATA__">${JSON.stringify({
      props: { pageProps: { searchData: {
        return_count: 1,
        data: [{
          cell_type: 100,
          series_id: 9796,
          series_name: "秦L DM",
          brand_name: "比亚迪",
          official_price: "9.68-12.68万",
          agent_price: "8.98-11.98万",
        }],
      } } },
    })}</script>`, 5);

    expect(data.items[0]).toEqual(expect.objectContaining({
      seriesId: "9796",
      name: "秦L DM",
      brand: "比亚迪",
      officialPrice: "9.68-12.68万",
      dealerPrice: "8.98-11.98万",
    }));
  });

  it("parses authenticated client-side search API rows", () => {
    const result = parseDongchediSearchApiResponse({
      return_count: 1,
      data: [{
        cell_type: 100,
        series_id: 9796,
        series_name: "秦L DM",
        brand_name: "比亚迪",
        official_price: "9.68-12.68万",
        agent_price: "8.98-11.98万",
      }],
    }, 5);

    expect(result).toEqual({
      total: 1,
      items: [{
        rank: 1,
        seriesId: "9796",
        name: "秦L DM",
        brand: "比亚迪",
        officialPrice: "9.68-12.68万",
        dealerPrice: "8.98-11.98万",
        pictureCount: null,
        sourceUrl: "https://www.dongchedi.com/auto/series/9796",
      }],
    });
  });

  it("parses only stable car-series rows and preserves source price text", () => {
    const data = parseDongchediSearchPage(validHtml, 1);

    expect(data.total).toBe(2);
    expect(data.items).toEqual([
      {
        rank: 1,
        seriesId: "5273",
        name: "宝马X5",
        brand: "华晨宝马",
        officialPrice: "59.80-74.80万",
        dealerPrice: "51.00-68.00万",
        pictureCount: 11355,
        sourceUrl: "https://www.dongchedi.com/auto/series/5273",
      },
    ]);
  });

  it("fails closed when the expected search payload is missing", () => {
    expect(() => parseDongchediSearchPage("<html></html>", 10)).toThrow(
      /__NEXT_DATA__/,
    );
    expect(() =>
      parseDongchediSearchPage(
        `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: {} } })}</script>`,
        10,
      ),
    ).toThrow(/searchData/);
  });
});

describe("Dongchedi page classification", () => {
  it("recognizes the current login-required redirect page", () => {
    const classification = classifyDongchediSearchPage(
      `<script id="__NEXT_DATA__">${JSON.stringify({
        page: "/login-required",
        props: { pageProps: { redirect: "/search?keyword=宝马X5" } },
      })}</script>`,
    );

    expect(classification?.code).toBe("auth_required");
    expect(classification?.status).toBe("blocked");
  });

  it("recognizes verification pages without parsing them as data", () => {
    const classification = classifyDongchediSearchPage(
      "<html><title>安全验证</title><body>captcha verify</body></html>",
    );

    expect(classification?.code).toBe("human_verification_required");
  });

  it("recognizes the empty fallback shell as source drift", () => {
    const classification = classifyDongchediSearchPage(
      `<script id="__NEXT_DATA__">${JSON.stringify({
        props: {
          pageProps: {
            __hasUrlCity: true,
            is_gray: false,
            clientIp: "127.0.0.1",
          },
        },
      })}</script>`,
    );

    expect(classification?.code).toBe("source_drift");
  });
});
