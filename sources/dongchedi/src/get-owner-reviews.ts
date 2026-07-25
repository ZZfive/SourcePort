/**
 * Dongchedi owner-review parser.
 *
 * Adapted from OpenCLI 1.8.6's Apache-2.0 Dongchedi `koubei` adapter and
 * changed to SourcePort's typed result and evidence contracts. See NOTICE.
 */

import type { PublicHttpClassification } from "@sourceport/core";

import {
  classifyDongchediBasePage,
  dongchediPageProps,
  extractDongchediNextData,
} from "./dongchedi-page.js";

export interface DongchediOwnerReview {
  reviewId: string;
  rank: number;
  userDisplayName: string;
  trim: string;
  score: number | null;
  likes: number;
  comments: number;
  excerpt: string;
  sourceUrl: string;
}

export interface DongchediOwnerReviewsData {
  seriesId: string;
  items: DongchediOwnerReview[];
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

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function score(value: unknown): number | null {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Number((number / 100).toFixed(2));
}

function excerpt(value: unknown, maximum = 180): string {
  const text = requiredText(value, "Dongchedi owner review content");
  return text.length > maximum ? `${text.slice(0, maximum)}…` : text;
}

export function classifyDongchediOwnerReviewsPage(
  html: string,
): PublicHttpClassification | undefined {
  const base = classifyDongchediBasePage(html);
  if (base) {
    return base;
  }
  try {
    const props = dongchediPageProps(extractDongchediNextData(html));
    const reviewListData = props["reviewListData"] as { review_list?: unknown } | undefined;
    if (!reviewListData || !Array.isArray(reviewListData.review_list)) {
      return {
        status: "failed",
        code: "source_drift",
        message: "Dongchedi owner-review page is missing reviewListData.review_list",
      };
    }
  } catch (error) {
    return {
      status: "failed",
      code: "source_drift",
      message: error instanceof Error ? error.message : "Dongchedi owner-review page shape changed",
    };
  }
  return undefined;
}

export function parseDongchediOwnerReviewsPage(
  html: string,
  seriesId: string,
  limit: number,
): DongchediOwnerReviewsData {
  stableId(seriesId, "Dongchedi series identity");
  const props = dongchediPageProps(extractDongchediNextData(html));
  const rows = (props["reviewListData"] as { review_list?: unknown } | undefined)?.review_list;
  if (!Array.isArray(rows)) {
    throw new Error("Dongchedi reviewListData.review_list was not an array");
  }
  const items: DongchediOwnerReview[] = [];
  for (const [index, raw] of rows.entries()) {
    const row = raw as Record<string, unknown>;
    const buy = row["buy_car_info"] as Record<string, unknown> | undefined;
    const user = row["user_info"] as Record<string, unknown> | undefined;
    const scoreInfo = row["score_info"] as Record<string, unknown> | undefined;
    const reviewId = stableId(row["gid_str"] ?? row["gid"], `Dongchedi owner review ${index + 1}`);
    const year = clean(buy?.["year"] ?? row["year"]);
    const carName = clean(buy?.["car_name"] ?? row["car_name"]);
    items.push({
      reviewId,
      rank: items.length + 1,
      userDisplayName: requiredText(
        user?.["name"],
        `Dongchedi owner review ${index + 1} user`,
      ),
      trim: [year, carName].filter(Boolean).join(" "),
      score: score(scoreInfo?.["score"]),
      likes: count(row["digg_count_en"]),
      comments: count(row["comment_count_en"]),
      excerpt: excerpt(row["content"]),
      sourceUrl: `https://www.dongchedi.com/ugc/article/${reviewId}`,
    });
    if (items.length >= limit) {
      break;
    }
  }
  if (items.length === 0) {
    throw new Error("Dongchedi returned no owner reviews for this series");
  }
  return { seriesId, items };
}
