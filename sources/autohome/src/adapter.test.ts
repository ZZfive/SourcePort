import { describe, expect, it } from "vitest";

import { AutohomeAdapter } from "./adapter.js";

const runtime = {
  signal: new AbortController().signal,
  now: () => new Date("2026-07-18T00:00:00.000Z"),
};

describe("AutohomeAdapter", () => {
  it("routes brand and score operations to separate public backends", async () => {
    const catalog = `<dl><dt><div><a>宝马</a></div></dt><li id="s6548"><h4><a>宝马X5</a></h4><div>指导价：<span>59.80-74.80万</span></div></li></dl>`;
    const score = `<script id="__NEXT_DATA__">${JSON.stringify({
      props: { pageProps: { baseData: { seriesname: "宝马X5", average: "4.41" } } },
    })}</script>`;
    const adapter = new AutohomeAdapter(async (input) =>
      new Response(String(input).includes("grade/carhtml") ? catalog : score, { status: 200 }),
    );

    const brandResult = await adapter.execute(
      { source: "autohome", operation: "list-brand-series", parameters: { brand: "宝马" } },
      runtime,
    );
    const scoreResult = await adapter.execute(
      { source: "autohome", operation: "get-series-score", parameters: { seriesId: "6548" } },
      runtime,
    );

    expect(brandResult.status).toBe("success");
    expect(brandResult.backend).toBe("autohome-brand-public");
    expect(scoreResult.status).toBe("success");
    expect(scoreResult.backend).toBe("autohome-score-public");
  });
});
