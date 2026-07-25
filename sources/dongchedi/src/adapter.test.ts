import { describe, expect, it, vi } from "vitest";

import type { SourceRequest } from "@sourceport/core";

import { DongchediAdapter } from "./adapter.js";

function request(parameters: unknown, operation = "search-series"): SourceRequest {
  return {
    requestId: "request-1",
    source: "dongchedi",
    operation,
    parameters,
  };
}

const validHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
  props: {
    pageProps: {
      searchData: {
        return_count: 1,
        data: [
          {
            cell_type: 26,
            series_id: 5273,
            display: { series_name: "宝马X5", official_price: "59.80-74.80万" },
          },
        ],
      },
    },
  },
})}</script>`;

const seriesHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
  props: {
    pageProps: {
      seriesId: "5273",
      seriesHomeHead: {
        series_id: 5273,
        series_name: "宝马X5",
        brand_name: "宝马",
        official_price: "59.80-74.80万",
      },
      scoreSimpleInfo: { score: 441, total_review_count: 100 },
      rankData: {},
      carModelsData: { tab_list: [{ tab_key: "online_all", data: [] }] },
    },
  },
})}</script>`;

const reviewsHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
  props: {
    pageProps: {
      reviewListData: {
        review_list: [{
          gid_str: "7399912345678901234",
          user_info: { name: "车主" },
          buy_car_info: { year: 2025, car_name: "xDrive30Li" },
          score_info: { score: 438 },
          content: "评价正文",
        }],
      },
    },
  },
})}</script>`;

const runtime = {
  signal: new AbortController().signal,
  now: () => new Date("2026-07-18T00:00:00.000Z"),
};

describe("DongchediAdapter search-series", () => {
  it("returns normalized live data with source evidence", async () => {
    const adapter = new DongchediAdapter({
      fetch: async () => new Response(validHtml, { status: 200 }),
    });

    const result = await adapter.execute(request({ keyword: "宝马X5", limit: 5 }), runtime);

    expect(result.status).toBe("success");
    expect(result.backend).toBe("dongchedi-public");
    expect(result.data).toEqual(
      expect.objectContaining({
        items: [expect.objectContaining({ seriesId: "5273", name: "宝马X5" })],
      }),
    );
    expect(result.evidence[0]?.sourceUrl).toContain("/search?keyword=");
  });

  it("retrieves series overview and owner reviews through public SSR pages", async () => {
    const adapter = new DongchediAdapter({
      fetch: async (input) => {
        const url = String(input);
        return new Response(url.includes("/score/") ? reviewsHtml : seriesHtml, {
          status: 200,
        });
      },
    });

    const series = await adapter.execute(
      request({ seriesId: "5273" }, "get-series"),
      runtime,
    );
    const reviews = await adapter.execute(
      request({ seriesId: "5273", limit: 1 }, "get-owner-reviews"),
      runtime,
    );

    expect(series).toEqual(expect.objectContaining({
      status: "success",
      backend: "dongchedi-series-public",
      data: expect.objectContaining({ seriesId: "5273", name: "宝马X5" }),
    }));
    expect(reviews).toEqual(expect.objectContaining({
      status: "success",
      backend: "dongchedi-owner-reviews-public",
      data: expect.objectContaining({
        items: [expect.objectContaining({ reviewId: "7399912345678901234" })],
      }),
    }));
  });

  it("returns explicit login recovery for the live login-required state", async () => {
    const loginHtml = `<script id="__NEXT_DATA__">${JSON.stringify({
      page: "/login-required",
      props: { pageProps: { redirect: "/search?keyword=宝马X5" } },
    })}</script>`;
    const adapter = new DongchediAdapter({
      fetch: async () => new Response(loginHtml, { status: 200 }),
    });

    const result = await adapter.execute(
      {
        ...request({ keyword: "宝马X5" }),
        execution: { retryBudget: 0 },
      },
      runtime,
    );

    expect(result.status).toBe("blocked");
    expect(result.failure?.code).toBe("auth_required");
    expect(result.recoveryActions.map((action) => action.kind)).toContain("login");
  });

  it("rejects unknown parameters before making a network request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const adapter = new DongchediAdapter({ fetch });

    const result = await adapter.execute(
      request({ keyword: "宝马X5", unknown: true }),
      runtime,
    );

    expect(result.status).toBe("failed");
    expect(result.failure?.code).toBe("unsupported_parameter");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a disconnected OpenCLI bridge as unconfigured without opening browser pages", async () => {
    const browserRun = vi.fn(async (_command: string, args: string[]) => args[0] === "--version"
      ? { exitCode: 0, stdout: "1.8.6", stderr: "" }
      : args[0] === "doctor"
        ? {
            exitCode: 0,
            stdout: "[MISSING] Daemon: not running\n[MISSING] Extension: not connected\n[FAIL] Connectivity: failed",
            stderr: "",
          }
        : (() => {
            throw new Error("browser page command must not run while OpenCLI is unconfigured");
          })());
    const adapter = new DongchediAdapter({
      fetch: async (input) => {
        const url = String(input);
        return new Response(
          url.includes("/score/") ? reviewsHtml : url.includes("/auto/series/") ? seriesHtml : validHtml,
          { status: 200 },
        );
      },
      browserRun,
    });

    const health = await adapter.health({ ...runtime, timeoutMs: 15_000 });

    expect(health.state).toBe("unconfigured");
    expect(health.operations.find((operation) => operation.operation === "search-series")?.state).toBe("healthy");
    expect(health.operations.find((operation) => operation.operation === "get-series")?.state).toBe("healthy");
    expect(health.operations.find((operation) => operation.operation === "get-owner-reviews")?.state).toBe("healthy");
    expect(health.operations.find((operation) => operation.operation === "list-trims")?.state).toBe("unconfigured");
    expect(health.operations.flatMap((operation) => operation.backends)).toContainEqual(
      expect.objectContaining({
        backend: "dongchedi-browser",
        state: "unconfigured",
        issueCode: "dependency_unavailable",
      }),
    );
    expect(browserRun).toHaveBeenCalledTimes(2);
  });
});
