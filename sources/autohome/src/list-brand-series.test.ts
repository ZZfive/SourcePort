import { describe, expect, it } from "vitest";

import { parseAutohomeBrandSeries, resolveBrandInitial } from "./list-brand-series.js";

const catalog = `
<dl>
  <dt><div><a>宝马</a></div></dt>
  <dd><ul>
    <li id="s6548"><h4><a>宝马X5</a></h4><div>指导价：<span>59.80-74.80万</span></div></li>
    <li id="s65"><h4><a>宝马3系</a></h4><div>指导价：<span>31.99-39.99万</span></div></li>
  </ul></dd>
</dl>
<dl><dt><div><a>奔驰</a></div></dt><li id="s197"><h4><a>奔驰C级</a></h4></li></dl>`;

describe("Autohome list-brand-series", () => {
  it("isolates the requested brand and keeps stable IDs and source prices", () => {
    expect(parseAutohomeBrandSeries(catalog, "宝马", 1)).toEqual([
      {
        seriesId: "6548",
        name: "宝马X5",
        guidePrice: "59.80-74.80万",
        sourceUrl: "https://www.autohome.com.cn/6548/",
      },
    ]);
  });

  it("maps known brands and allows explicit catalog initials", () => {
    expect(resolveBrandInitial("宝马")).toBe("B");
    expect(resolveBrandInitial("b")).toBe("B");
    expect(() => resolveBrandInitial("不存在的品牌")).toThrow(/unknown brand/);
  });

  it("fails closed on an unexpected catalog shape", () => {
    expect(() => parseAutohomeBrandSeries("<html></html>", "宝马", 10)).toThrow(
      /brand blocks/,
    );
  });
});
