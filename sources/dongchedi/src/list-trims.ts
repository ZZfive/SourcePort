import type { PublicHttpClassification } from "@sourceport/core";

import {
  classifyDongchediBasePage,
  dongchediPageProps,
  extractDongchediNextData,
} from "./dongchedi-page.js";

export type DongchediTrimStatus = "online" | "offline";

export interface DongchediTrimItem {
  trimId: string;
  name: string;
  year: string;
  officialPrice: string;
  dealerPrice: string;
  ownerPrice: string;
  sourceUrl: string;
  configurationUrl: string;
}

export interface DongchediTrimListData {
  seriesId: string;
  status: DongchediTrimStatus;
  items: DongchediTrimItem[];
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function stableId(value: unknown, label: string): string {
  const id = clean(value);
  if (!/^\d+$/.test(id) || id === "0") {
    throw new Error(`${label} did not include a stable numeric id`);
  }
  return id;
}

function price(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? `${value}万` : "";
  }
  return clean(value);
}

export function classifyDongchediTrimsPage(
  html: string,
): PublicHttpClassification | undefined {
  const base = classifyDongchediBasePage(html);
  if (base) {
    return base;
  }
  try {
    const props = dongchediPageProps(extractDongchediNextData(html));
    if (!("carModelsData" in props)) {
      return {
        status: "failed",
        code: "source_drift",
        message: "Dongchedi series page is missing carModelsData",
      };
    }
  } catch (error) {
    return {
      status: "failed",
      code: "source_drift",
      message: error instanceof Error ? error.message : "Dongchedi trims page shape changed",
    };
  }
  return undefined;
}

export function parseDongchediTrimsPage(
  html: string,
  expectedSeriesId: string,
  status: DongchediTrimStatus,
): DongchediTrimListData {
  const props = dongchediPageProps(extractDongchediNextData(html));
  const actualSeriesId = stableId(props["seriesId"], "Dongchedi series identity");
  if (actualSeriesId !== expectedSeriesId) {
    throw new Error(
      `Dongchedi series identity '${actualSeriesId}' did not match '${expectedSeriesId}'`,
    );
  }
  const modelData = props["carModelsData"] as { tab_list?: unknown };
  if (!Array.isArray(modelData?.tab_list)) {
    throw new Error("Dongchedi carModelsData.tab_list was not an array");
  }
  const wantedKey = status === "offline" ? "offline" : "online_all";
  const tab = modelData.tab_list.find((candidate) => {
    const value = candidate as { tab_key?: unknown; tab_text?: unknown };
    return value.tab_key === wantedKey ||
      (status === "offline" && /停售/.test(clean(value.tab_text)));
  }) as { data?: unknown } | undefined;
  const rows = tab?.data;
  if (!Array.isArray(rows)) {
    throw new Error(`Dongchedi ${status} trim data was not an array`);
  }
  const items: DongchediTrimItem[] = [];
  for (const [index, row] of rows.entries()) {
    const info = (row as { info?: Record<string, unknown> })?.info ?? {};
    const rawId = info["car_id"] ?? info["id"];
    if (!rawId) {
      continue;
    }
    const trimId = stableId(rawId, `Dongchedi trim row ${index + 1}`);
    const name = clean(info["name"] ?? info["car_name"]);
    if (!name) {
      throw new Error(`Dongchedi trim row ${index + 1} did not include stable text`);
    }
    items.push({
      trimId,
      name,
      year: clean(info["year"]),
      officialPrice: price(info["official_price"]),
      dealerPrice: price(info["dealer_price"]),
      ownerPrice: price(info["owner_price"]),
      sourceUrl: `https://www.dongchedi.com/auto/series/${actualSeriesId}/model-${trimId}`,
      configurationUrl: `https://www.dongchedi.com/auto/params-carIds-${trimId}`,
    });
  }
  return { seriesId: actualSeriesId, status, items };
}
