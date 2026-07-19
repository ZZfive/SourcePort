import { describe, expect, it } from "vitest";

import type { BackendExecutionContext } from "@sourceport/core";

import { DongchediBrowserBackend, type OpenCliProcessRunner } from "./browser-backend.js";
import { searchSeriesOperation } from "./manifest.js";

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
