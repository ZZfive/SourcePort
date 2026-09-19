/**
 * Parser and source-state classifier for Dongchedi search pages.
 *
 * The SSR extraction approach was adapted from OpenCLI 1.8.6's Apache-2.0
 * Dongchedi adapter and changed to SourcePort's typed result model. See NOTICE.
 */

import type { PublicHttpClassification } from "@sourceport/core";
import {
  humanVerificationRecovery,
  loginRecovery,
  switchBackendRecovery,
} from "@sourceport/core";

const DONGCHEDI_BASE = "https://www.dongchedi.com";
const SERIES_CELL_TYPE = 26;
const FALLBACK_SHELL_KEYS = new Set([
  "__hasUrlCity",
  "is_gray",
  "has_gray",
  "clientIp",
  "sensitiveSeriesIdList",
]);

interface NextData {
  page?: unknown;
  props?: {
    pageProps?: unknown;
  };
}

interface SearchDisplay {
  series_name?: unknown;
  title?: unknown;
  sub_brand_name?: unknown;
  official_price?: unknown;
  agent_price?: unknown;
  picture_num?: unknown;
}

interface SearchItem {
  cell_type?: unknown;
  series_id?: unknown;
  series_name?: unknown;
  brand_name?: unknown;
  sub_brand_name?: unknown;
  official_price?: unknown;
  agent_price?: unknown;
  open_url?: unknown;
  display?: SearchDisplay;
}

interface SearchData {
  data?: unknown;
  return_count?: unknown;
}

interface SearchApiRow {
  series_id?: unknown;
  series_name?: unknown;
  brand_name?: unknown;
  sub_brand_name?: unknown;
  official_price?: unknown;
  agent_price?: unknown;
  open_url?: unknown;
}

interface SearchApiResponse {
  data?: unknown;
  return_count?: unknown;
}

export interface DongchediSeriesSearchItem {
  rank: number;
  seriesId: string;
  name: string;
  brand: string;
  officialPrice: string;
  dealerPrice: string;
  pictureCount: number | null;
  sourceUrl: string;
}

export interface DongchediSeriesSearchData {
  total: number;
  items: DongchediSeriesSearchItem[];
}

function parseSeriesRows(rows: unknown[], totalValue: unknown, limit: number): DongchediSeriesSearchData {
  const items: DongchediSeriesSearchItem[] = [];
  for (const [index, rawItem] of rows.entries()) {
    const item = rawItem as SearchApiRow;
    if (!item || typeof item !== "object" || item.series_id === undefined) {
      continue;
    }
    const seriesId = stableId(item.series_id, `Dongchedi search API row ${index + 1}`);
    const name = requiredText(item.series_name, `Dongchedi search API row ${index + 1} name`);
    const openUrl = clean(item.open_url);
    items.push({
      rank: items.length + 1,
      seriesId,
      name,
      brand: clean(item.brand_name) || clean(item.sub_brand_name),
      officialPrice: clean(item.official_price),
      dealerPrice: clean(item.agent_price),
      pictureCount: null,
      sourceUrl: /^https?:\/\//i.test(openUrl)
        ? openUrl
        : `${DONGCHEDI_BASE}/auto/series/${seriesId}`,
    });
    if (items.length >= limit) {
      break;
    }
  }

  const total = Number(totalValue);
  return {
    total: Number.isFinite(total) ? total : items.length,
    items,
  };
}

/** Parse the authenticated client-side search API response. */
export function parseDongchediSearchApiResponse(
  payload: unknown,
  limit: number,
): DongchediSeriesSearchData {
  if (!payload || typeof payload !== "object") {
    throw new Error("Dongchedi search API response was not an object");
  }
  const response = payload as SearchApiResponse;
  if (!Array.isArray(response.data)) {
    throw new Error("Dongchedi search API response data was not an array");
  }
  return parseSeriesRows(response.data, response.return_count, limit);
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

function extractNextData(html: string): NextData | undefined {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    return undefined;
  }
  try {
    return JSON.parse(match[1]) as NextData;
  } catch {
    return undefined;
  }
}

function pageProps(nextData: NextData): Record<string, unknown> | undefined {
  const value = nextData.props?.pageProps;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function isFallbackShell(value: Record<string, unknown>): boolean {
  const realKeys = Object.keys(value).filter((key) => !FALLBACK_SHELL_KEYS.has(key));
  return realKeys.length === 0;
}

export function classifyDongchediSearchPage(
  html: string,
): PublicHttpClassification | undefined {
  if (/captcha|安全验证|访问验证|verify/i.test(html) && !/__NEXT_DATA__/.test(html)) {
    return {
      status: "blocked",
      code: "human_verification_required",
      message: "Dongchedi requires interactive access verification",
      recoveryActions: [
        humanVerificationRecovery("Complete Dongchedi verification in the logged-in browser"),
      ],
    };
  }

  const nextData = extractNextData(html);
  if (!nextData) {
    return {
      status: "failed",
      code: "source_drift",
      message: "Dongchedi search page returned no readable __NEXT_DATA__ payload",
    };
  }

  if (nextData.page === "/login-required") {
    return {
      status: "blocked",
      code: "auth_required",
      message: "Dongchedi search currently requires a logged-in browser session",
      recoveryActions: [
        loginRecovery("Log in to Dongchedi and keep the browser session open", "dongchedi-browser"),
        switchBackendRecovery(
          "dongchedi-browser",
          "Retry through the logged-in Dongchedi browser session",
        ),
      ],
    };
  }

  const props = pageProps(nextData);
  if (!props || isFallbackShell(props)) {
    return {
      status: "failed",
      code: "source_drift",
      message: "Dongchedi returned an empty fallback shell instead of search data",
    };
  }
  if (!("searchData" in props)) {
    return {
      status: "failed",
      code: "source_drift",
      message: "Dongchedi page shape changed: searchData is missing",
    };
  }
  return undefined;
}

export function parseDongchediSearchPage(
  html: string,
  limit: number,
): DongchediSeriesSearchData {
  const nextData = extractNextData(html);
  if (!nextData) {
    throw new Error("Dongchedi search page did not contain valid __NEXT_DATA__");
  }
  const props = pageProps(nextData);
  if (!props || !("searchData" in props)) {
    throw new Error("Dongchedi search page did not contain searchData");
  }
  const searchData = props["searchData"] as SearchData;
  if (!Array.isArray(searchData?.data)) {
    throw new Error("Dongchedi searchData.data was not an array");
  }

  const rows = searchData.data
    .filter((rawItem) => {
      const item = rawItem as SearchItem;
      return item?.cell_type === SERIES_CELL_TYPE ||
        (item?.cell_type === 100 && item.series_id !== undefined && item.series_name !== undefined);
    })
    .map((rawItem) => {
      const item = rawItem as SearchItem;
      const display = item.display ?? {};
      return {
        series_id: item.series_id,
        series_name: clean(item.series_name) || clean(display.series_name) || clean(display.title),
        brand_name: clean(item.brand_name),
        sub_brand_name: item.cell_type === 100 ? item.sub_brand_name : display.sub_brand_name,
        official_price: clean(item.official_price) || display.official_price,
        agent_price: clean(item.agent_price) || display.agent_price,
        open_url: item.open_url,
        picture_num: display.picture_num,
      };
    });
  const result = parseSeriesRows(rows, searchData.return_count, limit);
  const sourceItems = rows.slice(0, result.items.length);
  return {
    ...result,
    items: result.items.map((item, index) => ({
      ...item,
      pictureCount: Number.isFinite(Number(sourceItems[index]?.picture_num))
        ? Number(sourceItems[index]?.picture_num)
        : null,
    })),
  };
}
