import { describe, expect, it } from "vitest";

import type { BackendExecutionContext } from "@sourceport/core";

import { DongchediBrowserBackend, type OpenCliProcessRunner } from "./browser-backend.js";
import {
  getOwnerReviewsOperation,
  getSeriesOperation,
  listTrimsOperation,
  searchSeriesOperation,
} from "./manifest.js";

const context: BackendExecutionContext = {
  request: {
    requestId: "request-1",
    source: "dongchedi",
    operation: "search-series",
    parameters: { keyword: "宝马X5", limit: 3 },
  },
  operation: searchSeriesOperation,
  signal: new AbortController().signal,
  attempt: 1,
};

describe("DongchediBrowserBackend", () => {
  it("distinguishes a missing OpenCLI executable", async () => {
    const error = Object.assign(new Error("spawn opencli ENOENT"), { code: "ENOENT" });
    const backend = new DongchediBrowserBackend({
      run: async () => {
        throw error;
      },
    });

    await expect(backend.configuration(context.signal)).resolves.toEqual(expect.objectContaining({
      issueCode: "dependency_missing",
    }));
  });

  it("detects disconnected daemon or extension even when OpenCLI doctor exits zero", async () => {
    const backend = new DongchediBrowserBackend({
      run: async (_command, args) => args[0] === "--version"
        ? { exitCode: 0, stdout: "1.8.6", stderr: "" }
        : {
            exitCode: 0,
            stdout: "[MISSING] Daemon: not running\n[MISSING] Extension: not connected\n[FAIL] Connectivity: failed",
            stderr: "",
          },
    });

    await expect(backend.configuration(context.signal)).resolves.toEqual(expect.objectContaining({
      issueCode: "dependency_unavailable",
      message: expect.stringContaining("Extension"),
    }));
  });

  it("accepts a connected OpenCLI Browser Bridge", async () => {
    const backend = new DongchediBrowserBackend({
      run: async (_command, args) => args[0] === "--version"
        ? { exitCode: 0, stdout: "1.8.6", stderr: "" }
        : {
            exitCode: 0,
            stdout: "[OK] Daemon: running\n[OK] Extension: connected\n[OK] Connectivity: passed",
            stderr: "",
          },
    });

    await expect(backend.configuration(context.signal)).resolves.toBeUndefined();
  });

  it("opens the logged-in page and parses browser page state", async () => {
    const nextData = JSON.stringify({
      props: {
        pageProps: {
          searchData: {
            return_count: 1,
            data: [
              {
                cell_type: 26,
                series_id: 5273,
                display: { series_name: "宝马X5" },
              },
            ],
          },
        },
      },
    });
    let calls = 0;
    const run: OpenCliProcessRunner = async () => {
      calls += 1;
      return calls === 1
        ? { exitCode: 0, stdout: JSON.stringify({ url: "https://www.dongchedi.com/search" }), stderr: "" }
        : {
            exitCode: 0,
            stdout: JSON.stringify({
              url: "https://www.dongchedi.com/search?keyword=宝马X5",
              nextData,
              bodyText: "",
            }),
            stderr: "",
          };
    };
    const backend = new DongchediBrowserBackend({ run });

    const result = await backend.execute(context);

    expect(result.status).toBe("success");
    expect(result.backend).toBe("dongchedi-browser");
    const data = result.data as { items?: Array<{ seriesId?: string }> } | undefined;
    expect(data?.items?.[0]).toEqual(expect.objectContaining({ seriesId: "5273" }));
    expect(calls).toBe(2);
  });

  it("uses the same typed parser for the series browser fallback", async () => {
    const nextData = JSON.stringify({
      props: {
        pageProps: {
          seriesId: "5273",
          seriesHomeHead: {
            series_id: 5273,
            series_name: "宝马X5",
            brand_name: "宝马",
            official_price: "59.80-74.80万",
          },
          scoreSimpleInfo: {},
          rankData: {},
          carModelsData: { tab_list: [] },
        },
      },
    });
    let calls = 0;
    const backend = new DongchediBrowserBackend({
      run: async () => {
        calls += 1;
        return calls === 1
          ? { exitCode: 0, stdout: "", stderr: "" }
          : {
              exitCode: 0,
              stdout: JSON.stringify({
                url: "https://www.dongchedi.com/auto/series/5273",
                nextData,
                bodyText: "",
              }),
              stderr: "",
            };
      },
    });

    const result = await backend.execute({
      request: {
        requestId: "series-request",
        source: "dongchedi",
        operation: "get-series",
        parameters: { seriesId: "5273" },
      },
      operation: getSeriesOperation,
      signal: new AbortController().signal,
      attempt: 1,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      backend: "dongchedi-browser",
      data: expect.objectContaining({ seriesId: "5273", name: "宝马X5" }),
    }));
  });

  it("fetches owner-review SSR through the existing logged-in page without navigation", async () => {
    const nextData = JSON.stringify({
      props: {
        pageProps: {
          reviewListData: {
            review_list: [{
              gid_str: "7399912345678901234",
              user_info: { name: "车主" },
              buy_car_info: { year: 2026, car_name: "xDrive40Li" },
              score_info: { score: 460 },
              content: "评价正文",
            }],
          },
        },
      },
    });
    const calls: string[][] = [];
    const backend = new DongchediBrowserBackend({
      run: async (_command, args) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            url: "https://www.dongchedi.com/auto/series/score/5273-x-x-x-x-x",
            nextData,
            bodyText: "",
          }),
          stderr: "",
        };
      },
    });

    const result = await backend.execute({
      request: {
        requestId: "reviews-request",
        source: "dongchedi",
        operation: "get-owner-reviews",
        parameters: { seriesId: "5273", limit: 1 },
      },
      operation: getOwnerReviewsOperation,
      signal: new AbortController().signal,
      attempt: 1,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      data: expect.objectContaining({
        items: [expect.objectContaining({ reviewId: "7399912345678901234" })],
      }),
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(["eval"]));
    expect(calls[0]).not.toEqual(expect.arrayContaining(["open"]));
  });

  it("fetches the trim-list SSR through the existing logged-in page without navigation", async () => {
    const nextData = JSON.stringify({
      props: {
        pageProps: {
          seriesId: "5273",
          carModelsData: {
            tab_list: [{
              tab_key: "online_all",
              data: [{
                info: {
                  car_id: 255925,
                  name: "xDrive30Li",
                  year: 2026,
                  official_price: 59.8,
                },
              }],
            }],
          },
        },
      },
    });
    const calls: string[][] = [];
    const backend = new DongchediBrowserBackend({
      run: async (_command, args) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            url: "https://www.dongchedi.com/auto/series/5273",
            nextData,
            bodyText: "",
          }),
          stderr: "",
        };
      },
    });

    const result = await backend.execute({
      request: {
        requestId: "trims-request",
        source: "dongchedi",
        operation: "list-trims",
        parameters: { seriesId: "5273", status: "online" },
      },
      operation: listTrimsOperation,
      signal: new AbortController().signal,
      attempt: 1,
    });

    expect(result).toEqual(expect.objectContaining({
      status: "success",
      data: expect.objectContaining({
        items: [expect.objectContaining({ trimId: "255925" })],
      }),
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(expect.arrayContaining(["eval"]));
    expect(calls[0]).not.toEqual(expect.arrayContaining(["open"]));
  });

  it("reports a missing Browser Bridge as unconfigured", async () => {
    const backend = new DongchediBrowserBackend({
      run: async () => ({
        exitCode: 1,
        stdout: "",
        stderr: "Browser Bridge extension not connected",
      }),
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("failed");
    expect(result.failure?.code).toBe("backend_unavailable");
  });
});
