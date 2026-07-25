/**
 * Dongchedi series overview parser.
 *
 * Adapted from OpenCLI 1.8.6's Apache-2.0 Dongchedi `series` adapter and
 * changed to SourcePort's typed result and evidence contracts. See NOTICE.
 */

import type { PublicHttpClassification } from "@sourceport/core";

import {
  classifyDongchediBasePage,
  dongchediPageProps,
  extractDongchediNextData,
} from "./dongchedi-page.js";

export interface DongchediSeriesData {
  seriesId: string;
  name: string;
  brand: string;
  subBrand: string;
  officialPrice: string;
  dealerPrice: string;
  usedPrice: string;
  score: number | null;
  reviewCount: number | null;
  saleRank: string;
  scoreRank: string;
  onSaleTrimCount: number | null;
  sourceUrl: string;
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

function requiredText(value: unknown, label: string): string {
  const text = clean(value);
  if (!text) {
    throw new Error(`${label} did not include stable text`);
  }
  return text;
}

function optionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function score(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Number((number / 100).toFixed(2));
}

function rank(value: unknown): string {
  const section = value as {
    rank_name?: unknown;
    list?: Array<{ rank?: unknown; rank_name?: unknown }>;
  } | undefined;
  const first = section?.list?.[0];
  const numericRank = Number(first?.rank);
  if (!Number.isFinite(numericRank) || numericRank < 1) {
    return "";
  }
  const name = clean(section?.rank_name ?? first?.rank_name);
  return name ? `${name} 第${numericRank}名` : `第${numericRank}名`;
}

function onSaleTrimCount(value: unknown): number | null {
  const tabs = (value as { tab_list?: unknown } | undefined)?.tab_list;
  if (!Array.isArray(tabs)) {
    return null;
  }
  const tab = tabs.find((candidate) => {
    const entry = candidate as { tab_key?: unknown };
    return entry.tab_key === "online_all";
  }) ?? tabs[0];
  const rows = (tab as { data?: unknown } | undefined)?.data;
  if (!Array.isArray(rows)) {
    return null;
  }
  return rows.filter((row) => {
    const info = (row as { info?: Record<string, unknown> })?.info;
    return Boolean(info?.["car_id"] ?? info?.["id"]);
  }).length;
}

export function classifyDongchediSeriesPage(
  html: string,
): PublicHttpClassification | undefined {
  const base = classifyDongchediBasePage(html);
  if (base) {
    return base;
  }
  try {
    const props = dongchediPageProps(extractDongchediNextData(html));
    if (!("seriesHomeHead" in props)) {
      return {
        status: "failed",
        code: "source_drift",
        message: "Dongchedi series page is missing seriesHomeHead",
      };
    }
  } catch (error) {
    return {
      status: "failed",
      code: "source_drift",
      message: error instanceof Error ? error.message : "Dongchedi series page shape changed",
    };
  }
  return undefined;
}

export function parseDongchediSeriesPage(
  html: string,
  expectedSeriesId: string,
): DongchediSeriesData {
  const props = dongchediPageProps(extractDongchediNextData(html));
  const head = props["seriesHomeHead"] as Record<string, unknown> | undefined;
  if (!head || typeof head !== "object" || Array.isArray(head)) {
    throw new Error("Dongchedi seriesHomeHead was not an object");
  }
  const actualSeriesId = stableId(
    head["series_id"] ?? props["seriesId"],
    "Dongchedi series identity",
  );
  if (actualSeriesId !== expectedSeriesId) {
    throw new Error(
      `Dongchedi series identity '${actualSeriesId}' did not match '${expectedSeriesId}'`,
    );
  }
  const simpleScore = props["scoreSimpleInfo"] as Record<string, unknown> | undefined;
  const rankData = props["rankData"] as Record<string, unknown> | undefined;
  const lowUsedPrice = clean(head["sh_low_Price"]);
  const highUsedPrice = clean(head["sh_high_price"]);
  const usedPrice = lowUsedPrice || highUsedPrice
    ? `${lowUsedPrice || "?"}-${highUsedPrice || "?"}万`
    : "";
  return {
    seriesId: actualSeriesId,
    name: requiredText(head["series_name"], "Dongchedi series name"),
    brand: requiredText(head["brand_name"], "Dongchedi series brand"),
    subBrand: clean(head["sub_brand_name"]),
    officialPrice: head["has_official_price"] === false ? "" : clean(head["official_price"]),
    dealerPrice: head["has_dealer_price"] === false ? "" : clean(head["dealer_price"]),
    usedPrice,
    score: score(simpleScore?.["score"]),
    reviewCount: optionalNumber(simpleScore?.["total_review_count"]),
    saleRank: rank(rankData?.["sale"]),
    scoreRank: rank(rankData?.["score"]),
    onSaleTrimCount: onSaleTrimCount(props["carModelsData"]),
    sourceUrl: `https://www.dongchedi.com/auto/series/${actualSeriesId}`,
  };
}
