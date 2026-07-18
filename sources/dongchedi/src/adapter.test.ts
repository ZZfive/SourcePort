import { describe, expect, it, vi } from "vitest";

import type { SourceRequest } from "@sourceport/core";

import { DongchediAdapter } from "./adapter.js";

function request(parameters: unknown): SourceRequest {
  return {
    requestId: "request-1",
    source: "dongchedi",
    operation: "search-series",
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
});
