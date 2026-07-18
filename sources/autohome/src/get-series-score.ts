/**
 * Autohome series-score parser adapted from OpenCLI 1.8.6 (Apache-2.0).
 * Output was redesigned for SourcePort and preserves aggregate, dimension,
 * reliability, and competitor evidence separately. See NOTICE.
 */

const AUTOHOME_SCORE_BASE = "https://k.autohome.com.cn";

interface ScoreAxis {
  typeName?: unknown;
  score?: unknown;
}

interface Competitor {
  seriesId?: unknown;
  seriesid?: unknown;
  seriesName?: unknown;
  seriesname?: unknown;
  score?: unknown;
  average?: unknown;
}

export interface AutohomeSeriesScore {
  seriesId: string;
  name: string;
  brand: string;
  level: string;
  guidePrice: string;
  overallScore: number | null;
  dimensions: Array<{ name: string; score: number | null }>;
  reliability: { pph: number | null; reviewUsers: number | null };
  competitors: Array<{ seriesId: string; name: string; score: number | null }>;
  sourceUrl: string;
}

function clean(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function numberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function extractPageProps(html: string): Record<string, unknown> {
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match?.[1]) {
    throw new Error("Autohome score page returned no __NEXT_DATA__");
  }
  const root = JSON.parse(match[1]) as {
    props?: { pageProps?: unknown };
  };
  const value = root.props?.pageProps;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Autohome score page returned invalid pageProps");
  }
  return value as Record<string, unknown>;
}

export function parseAutohomeSeriesScore(
  html: string,
  seriesId: string,
): AutohomeSeriesScore {
  if (!/^\d+$/.test(seriesId)) {
    throw new Error("seriesId must be a stable numeric identifier");
  }
  const props = extractPageProps(html);
  const baseData = props["baseData"];
  if (!baseData || typeof baseData !== "object" || Array.isArray(baseData)) {
    throw new Error("Autohome score page returned no baseData");
  }
  const base = baseData as Record<string, unknown>;
  const qualityValue = props["qualityData"];
  const quality = qualityValue && typeof qualityValue === "object" && !Array.isArray(qualityValue)
    ? (qualityValue as Record<string, unknown>)
    : {};

  const dimensions = (Array.isArray(base["seriesScoreList"]) ? base["seriesScoreList"] : [])
    .map((raw) => raw as ScoreAxis)
    .map((axis) => ({ name: clean(axis.typeName), score: numberOrNull(axis.score) }))
    .filter((axis) => axis.name.length > 0);
  const competitors = (Array.isArray(base["cmpSeriesScore"]) ? base["cmpSeriesScore"] : [])
    .map((raw) => raw as Competitor)
    .map((competitor) => ({
      seriesId: clean(competitor.seriesId ?? competitor.seriesid),
      name: clean(competitor.seriesName ?? competitor.seriesname),
      score: numberOrNull(competitor.score ?? competitor.average),
    }))
    .filter((competitor) => /^\d+$/.test(competitor.seriesId) && competitor.name.length > 0)
    .slice(0, 8);
  const price = clean(base["pricerange"]);

  return {
    seriesId,
    name: clean(base["seriesname"]),
    brand: clean(base["brandName"]),
    level: clean(base["levelname"]),
    guidePrice: price ? `${price}万` : "",
    overallScore: numberOrNull(base["average"] ?? base["seriesAverage"]),
    dimensions,
    reliability: {
      pph: numberOrNull(quality["pph"]),
      reviewUsers: numberOrNull(quality["userCount"]),
    },
    competitors,
    sourceUrl: `${AUTOHOME_SCORE_BASE}/${seriesId}`,
  };
}
