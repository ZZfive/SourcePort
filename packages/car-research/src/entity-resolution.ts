import type { CrossSourceMatch } from "./contracts.js";

export interface SeriesIdentity {
  seriesId: string;
  name: string;
  brand: string;
  evidenceIds: string[];
}

export function normalizeCarName(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s·•・_\-—–()（）\[\]【】]/g, "")
    .trim();
}

function sameBrand(left: string, right: string): boolean {
  if (!left || !right) {
    return true;
  }
  return normalizeCarName(left) === normalizeCarName(right);
}

export function exactSeriesMatches<T extends SeriesIdentity>(
  name: string,
  brand: string,
  candidates: readonly T[],
): T[] {
  const normalizedName = normalizeCarName(name);
  return candidates.filter((candidate) =>
    normalizeCarName(candidate.name) === normalizedName && sameBrand(brand, candidate.brand));
}

export function crossSourceMatch(input: {
  dongchedi?: SeriesIdentity;
  autohomeMatches: readonly SeriesIdentity[];
}): CrossSourceMatch {
  if (!input.dongchedi) {
    return {
      status: "unmatched",
      message: "no validated Dongchedi series identity is available",
      evidenceIds: [],
    };
  }
  if (input.autohomeMatches.length === 0) {
    return {
      status: "unmatched",
      message: "no exact normalized Autohome brand/name match was found",
      dongchediSeriesId: input.dongchedi.seriesId,
      evidenceIds: input.dongchedi.evidenceIds,
    };
  }
  if (input.autohomeMatches.length > 1) {
    return {
      status: "conflict",
      message: "multiple exact Autohome identities matched the Dongchedi series",
      dongchediSeriesId: input.dongchedi.seriesId,
      evidenceIds: [
        ...input.dongchedi.evidenceIds,
        ...input.autohomeMatches.flatMap((candidate) => candidate.evidenceIds),
      ],
    };
  }
  const autohome = input.autohomeMatches[0]!;
  return {
    status: "matched",
    message: "brand and normalized series name matched exactly across sources",
    dongchediSeriesId: input.dongchedi.seriesId,
    autohomeSeriesId: autohome.seriesId,
    evidenceIds: [...input.dongchedi.evidenceIds, ...autohome.evidenceIds],
  };
}
