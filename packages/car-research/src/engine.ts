import { randomUUID } from "node:crypto";

import type {
  EvidenceRecord,
  RecoveryAction,
  SourceResult,
  SourceWarning,
} from "@sourceport/core";

import {
  candidateEligibility,
  compareCandidates,
  evaluateCriteria,
  evidenceCompleteness,
  isSupportedCriterion,
} from "./criteria.js";
import type {
  CarCandidate,
  CarResearchDependencies,
  CarResearchReport,
  CrossSourceMatch,
} from "./contracts.js";
import {
  resolvedLimits,
  validateCarResearchBrief,
} from "./contracts.js";
import {
  crossSourceMatch,
  exactSeriesMatches,
  normalizeCarName,
  type SeriesIdentity,
} from "./entity-resolution.js";
import {
  calculateOnRoadCost,
  costEvidenceRecord,
  parsePriceRangeCny,
} from "./price.js";

interface DongchediSearchItem {
  seriesId: string;
  name: string;
  brand: string;
  officialPrice: string;
  dealerPrice: string;
  sourceUrl: string;
}

interface DongchediSearchData {
  items: DongchediSearchItem[];
}

interface DongchediSeriesOverview {
  seriesId: string;
  name: string;
  brand: string;
  officialPrice: string;
  dealerPrice: string;
  score: number | null;
  sourceUrl: string;
}

interface DongchediTrim {
  trimId: string;
  name: string;
  year: string;
  officialPrice: string;
  dealerPrice: string;
  ownerPrice: string;
  sourceUrl: string;
  configurationUrl: string;
}

interface DongchediTrimListData {
  items: DongchediTrim[];
}

interface DongchediOwnerReviewsData {
  items: unknown[];
}

interface DongchediConfigurationData {
  configuration: unknown[];
  drivingAssistance: unknown;
}

interface AutohomeSeriesItem {
  seriesId: string;
  name: string;
  guidePrice: string;
  sourceUrl: string;
}

interface AutohomeBrandData {
  brand: string;
  items: AutohomeSeriesItem[];
}

interface AutohomeSeriesScoreData {
  seriesId: string;
  name: string;
  brand: string;
  level: string;
  guidePrice: string;
  overallScore: number | null;
  competitors: Array<{ seriesId: string; name: string; score: number | null }>;
  sourceUrl: string;
}

type DongchediIdentity = SeriesIdentity & { sourceUrl: string };
type AutohomeIdentity = SeriesIdentity & { sourceUrl: string; guidePrice: string };

interface DraftSeries {
  name: string;
  brand: string;
  seedOrder: number;
  guidePrice: string;
  dongchedi?: DongchediIdentity;
  autohomeMatches: AutohomeIdentity[];
  autohomeScore?: AutohomeSeriesScoreData;
  evidenceIds: string[];
  sourceUrls: string[];
}

interface CallResult<T> {
  data: T | undefined;
  evidenceIds: string[];
  result: SourceResult;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function warningKey(warning: SourceWarning): string {
  return `${warning.code}:${warning.field ?? ""}:${warning.message}`;
}

function recoveryKey(action: RecoveryAction): string {
  return `${action.kind}:${action.backend ?? ""}:${action.resumeToken ?? ""}:${action.description}`;
}

function draftKey(name: string, brand: string): string {
  return `${normalizeCarName(name)}:${normalizeCarName(brand)}`;
}

function identityFromDongchedi(
  item: DongchediSearchItem,
  evidenceIds: string[],
): DongchediIdentity {
  return {
    seriesId: item.seriesId,
    name: item.name,
    brand: item.brand,
    evidenceIds,
    sourceUrl: item.sourceUrl,
  };
}

function identityFromAutohome(
  item: AutohomeSeriesItem,
  brand: string,
  evidenceIds: string[],
): AutohomeIdentity {
  return {
    seriesId: item.seriesId,
    name: item.name,
    brand,
    evidenceIds,
    sourceUrl: item.sourceUrl,
    guidePrice: item.guidePrice,
  };
}

function cheapestTrim(items: readonly DongchediTrim[]): DongchediTrim | undefined {
  return [...items].sort((left, right) => {
    const leftPrice = parsePriceRangeCny(
      left.dealerPrice || left.ownerPrice || left.officialPrice,
    )?.minimumCny ?? Number.POSITIVE_INFINITY;
    const rightPrice = parsePriceRangeCny(
      right.dealerPrice || right.ownerPrice || right.officialPrice,
    )?.minimumCny ?? Number.POSITIVE_INFINITY;
    return leftPrice - rightPrice || left.trimId.localeCompare(right.trimId);
  })[0];
}

function emptyReport(input: unknown, now: Date, issues: Array<{ path: string; message: string }>): CarResearchReport {
  const record = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const marketRecord = record["market"] !== null && typeof record["market"] === "object"
    ? record["market"] as Record<string, unknown>
    : {};
  return {
    status: "failed",
    query: typeof record["query"] === "string" ? record["query"] : "",
    market: { city: typeof marketRecord["city"] === "string" ? marketRecord["city"] : "" },
    generatedAt: now.toISOString(),
    coverage: {
      mode: "bounded",
      limits: resolvedLimits(undefined),
      attemptedSeeds: 0,
      validatedSeeds: 0,
      expandedSeries: 0,
      scannedSeries: 0,
      configuredTrims: 0,
      limitations: ["research did not start because the brief was invalid"],
    },
    candidates: [],
    rejected: [],
    unsupportedCriteria: [],
    warnings: [],
    recoveryActions: [],
    evidence: [],
    failure: {
      code: "invalid_brief",
      message: "invalid CarResearchBrief",
      issues,
    },
  };
}

export async function researchCars(
  input: unknown,
  dependencies: CarResearchDependencies,
): Promise<CarResearchReport> {
  const now = dependencies.now ?? (() => new Date());
  const validation = validateCarResearchBrief(input);
  if (!validation.ok || !validation.value) {
    return emptyReport(input, now(), validation.issues);
  }
  const brief = validation.value;
  const limits = resolvedLimits(brief.limits);
  const evidence = new Map<string, EvidenceRecord>();
  const warnings = new Map<string, SourceWarning>();
  const recoveryActions = new Map<string, RecoveryAction>();
  let blockedCalls = 0;

  for (const item of brief.costEvidence ?? []) {
    const record = costEvidenceRecord(item);
    evidence.set(record.id, record);
  }

  const addWarning = (warning: SourceWarning) => {
    warnings.set(warningKey(warning), warning);
  };
  const call = async <T>(
    source: string,
    operation: string,
    parameters: unknown,
  ): Promise<CallResult<T>> => {
    const result = await dependencies.execute({
      requestId: randomUUID(),
      source,
      operation,
      parameters,
      ...(brief.freshness ? { freshness: brief.freshness } : {}),
      ...(brief.execution ? { execution: brief.execution } : {}),
    });
    result.evidence.forEach((record) => evidence.set(record.id, record));
    result.warnings.forEach(addWarning);
    result.recoveryActions.forEach((action) => recoveryActions.set(recoveryKey(action), action));
    if (result.status === "blocked") {
      blockedCalls += 1;
    }
    if (result.status === "blocked" || result.status === "failed") {
      addWarning({
        code: `source_${result.failure?.code ?? result.status}`,
        message: `${source}.${operation}: ${result.failure?.message ?? result.status}`,
      });
    }
    return {
      data: result.data as T | undefined,
      evidenceIds: result.evidence.map((record) => record.id),
      result,
    };
  };

  const pool: DraftSeries[] = [];
  const addDraft = (candidate: DraftSeries) => {
    const existing = pool.find((item) =>
      draftKey(item.name, item.brand) === draftKey(candidate.name, candidate.brand) ||
      (normalizeCarName(item.name) === normalizeCarName(candidate.name) &&
        (!item.brand || !candidate.brand)));
    if (existing) {
      existing.brand ||= candidate.brand;
      existing.guidePrice ||= candidate.guidePrice;
      existing.seedOrder = Math.min(existing.seedOrder, candidate.seedOrder);
      if (!existing.dongchedi && candidate.dongchedi) {
        existing.dongchedi = candidate.dongchedi;
      }
      for (const match of candidate.autohomeMatches) {
        if (!existing.autohomeMatches.some((item) => item.seriesId === match.seriesId)) {
          existing.autohomeMatches.push(match);
        }
      }
      existing.evidenceIds = unique([...existing.evidenceIds, ...candidate.evidenceIds]);
      existing.sourceUrls = unique([...existing.sourceUrls, ...candidate.sourceUrls]);
      return;
    }
    if (pool.length < limits.expandedSeries) {
      pool.push(candidate);
    }
  };

  const brandCatalogs = new Map<string, CallResult<AutohomeBrandData>>();
  const brandCatalog = async (brand: string): Promise<CallResult<AutohomeBrandData>> => {
    const key = normalizeCarName(brand);
    const cached = brandCatalogs.get(key);
    if (cached) {
      return cached;
    }
    const fetched = await call<AutohomeBrandData>(
      "autohome",
      "list-brand-series",
      { brand, limit: 120 },
    );
    brandCatalogs.set(key, fetched);
    return fetched;
  };

  let validatedSeeds = 0;
  for (const [seedOrder, seed] of brief.seeds.slice(0, limits.initialSeeds).entries()) {
    let seedValidated = false;
    if (seed.kind === "series") {
      const search = await call<DongchediSearchData>(
        "dongchedi",
        "search-series",
        { keyword: seed.name, limit: 10 },
      );
      const candidates = search.data?.items ?? [];
      const exact = seed.sourceId
        ? candidates.filter((item) => item.seriesId === seed.sourceId)
        : exactSeriesMatches(seed.name, seed.brand ?? "", candidates.map((item) => ({
            seriesId: item.seriesId,
            name: item.name,
            brand: item.brand,
            evidenceIds: search.evidenceIds,
          }))).map((identity) => candidates.find((item) => item.seriesId === identity.seriesId)!)
          .filter(Boolean);
      if (exact.length === 1) {
        const item = exact[0]!;
        addDraft({
          name: item.name,
          brand: item.brand || seed.brand || "",
          seedOrder,
          guidePrice: item.officialPrice,
          dongchedi: identityFromDongchedi(item, search.evidenceIds),
          autohomeMatches: [],
          evidenceIds: search.evidenceIds,
          sourceUrls: [item.sourceUrl],
        });
        seedValidated = true;
      } else {
        addWarning({
          code: exact.length > 1 ? "seed_conflict" : "seed_rejected",
          message: exact.length > 1
            ? `series seed '${seed.name}' matched multiple exact Dongchedi identities`
            : `series seed '${seed.name}' was not validated by Dongchedi`,
        });
      }
    } else {
      const catalog = await brandCatalog(seed.brand);
      const rows = [...(catalog.data?.items ?? [])].sort((left, right) => {
        const leftPrice = parsePriceRangeCny(left.guidePrice)?.minimumCny ?? Number.POSITIVE_INFINITY;
        const rightPrice = parsePriceRangeCny(right.guidePrice)?.minimumCny ?? Number.POSITIVE_INFINITY;
        return leftPrice - rightPrice || left.name.localeCompare(right.name);
      });
      for (const item of rows) {
        if (pool.length >= limits.expandedSeries) {
          break;
        }
        const identity = identityFromAutohome(item, seed.brand, catalog.evidenceIds);
        addDraft({
          name: item.name,
          brand: seed.brand,
          seedOrder,
          guidePrice: item.guidePrice,
          autohomeMatches: [identity],
          evidenceIds: catalog.evidenceIds,
          sourceUrls: [item.sourceUrl],
        });
        seedValidated = true;
      }
      if (!seedValidated) {
        addWarning({ code: "seed_rejected", message: `brand seed '${seed.brand}' returned no series` });
      }
    }
    if (seedValidated) {
      validatedSeeds += 1;
    }
  }

  const resolveAutohome = async (draft: DraftSeries) => {
    if (draft.autohomeMatches.length > 0 || !draft.brand) {
      return;
    }
    const catalog = await brandCatalog(draft.brand);
    const identities = (catalog.data?.items ?? []).map((item) =>
      identityFromAutohome(item, draft.brand, catalog.evidenceIds));
    draft.autohomeMatches = exactSeriesMatches(draft.name, draft.brand, identities);
    draft.evidenceIds = unique([
      ...draft.evidenceIds,
      ...draft.autohomeMatches.flatMap((item) => item.evidenceIds),
    ]);
    draft.sourceUrls = unique([
      ...draft.sourceUrls,
      ...draft.autohomeMatches.map((item) => item.sourceUrl),
    ]);
  };

  const resolveDongchedi = async (draft: DraftSeries) => {
    if (draft.dongchedi) {
      return;
    }
    const search = await call<DongchediSearchData>(
      "dongchedi",
      "search-series",
      { keyword: draft.name, limit: 10 },
    );
    const identities = (search.data?.items ?? []).map((item) => ({
      seriesId: item.seriesId,
      name: item.name,
      brand: item.brand,
      evidenceIds: search.evidenceIds,
    }));
    const exact = exactSeriesMatches(draft.name, draft.brand, identities);
    if (exact.length === 1) {
      const item = search.data?.items.find((candidate) => candidate.seriesId === exact[0]!.seriesId);
      if (item) {
        draft.dongchedi = identityFromDongchedi(item, search.evidenceIds);
        draft.brand ||= item.brand;
        draft.evidenceIds = unique([...draft.evidenceIds, ...search.evidenceIds]);
        draft.sourceUrls = unique([...draft.sourceUrls, item.sourceUrl]);
      }
    } else if (exact.length > 1) {
      addWarning({
        code: "cross_source_conflict",
        message: `series '${draft.name}' matched multiple Dongchedi identities`,
      });
    } else {
      addWarning({
        code: "cross_source_unmatched",
        message: `series '${draft.name}' did not exactly match Dongchedi`,
      });
    }
  };

  const scoreFor = async (draft: DraftSeries) => {
    if (draft.autohomeScore || draft.autohomeMatches.length !== 1) {
      return;
    }
    const score = await call<AutohomeSeriesScoreData>(
      "autohome",
      "get-series-score",
      { seriesId: draft.autohomeMatches[0]!.seriesId },
    );
    if (score.data) {
      draft.autohomeScore = score.data;
      draft.brand ||= score.data.brand;
      draft.evidenceIds = unique([...draft.evidenceIds, ...score.evidenceIds]);
      draft.sourceUrls = unique([...draft.sourceUrls, score.data.sourceUrl]);
    }
  };

  for (const draft of pool) {
    await resolveAutohome(draft);
  }
  for (let index = 0; index < pool.length && pool.length < limits.expandedSeries; index += 1) {
    const draft = pool[index]!;
    await scoreFor(draft);
    for (const competitor of draft.autohomeScore?.competitors ?? []) {
      if (pool.length >= limits.expandedSeries) {
        break;
      }
      const evidenceIds = draft.evidenceIds;
      addDraft({
        name: competitor.name,
        brand: "",
        seedOrder: Number.MAX_SAFE_INTEGER,
        guidePrice: "",
        autohomeMatches: [{
          seriesId: competitor.seriesId,
          name: competitor.name,
          brand: "",
          evidenceIds,
          sourceUrl: `https://www.autohome.com.cn/${competitor.seriesId}/`,
          guidePrice: "",
        }],
        evidenceIds,
        sourceUrls: [`https://www.autohome.com.cn/${competitor.seriesId}/`],
      });
    }
  }
  for (const draft of pool) {
    await resolveDongchedi(draft);
  }

  const orderedDrafts = [...pool].sort((left, right) => {
    const order = left.seedOrder - right.seedOrder;
    if (order !== 0) {
      return order;
    }
    const leftPrice = parsePriceRangeCny(left.guidePrice)?.minimumCny ?? Number.POSITIVE_INFINITY;
    const rightPrice = parsePriceRangeCny(right.guidePrice)?.minimumCny ?? Number.POSITIVE_INFINITY;
    return leftPrice - rightPrice || left.name.localeCompare(right.name);
  });

  const builtCandidates: CarCandidate[] = [];
  let scannedSeries = 0;
  let configuredTrims = 0;
  for (const draft of orderedDrafts) {
    if (scannedSeries >= limits.scannedSeries) {
      break;
    }
    if (!draft.dongchedi) {
      continue;
    }
    scannedSeries += 1;
    await resolveAutohome(draft);
    await scoreFor(draft);
    const series = await call<DongchediSeriesOverview>(
      "dongchedi",
      "get-series",
      { seriesId: draft.dongchedi.seriesId },
    );
    const trims = await call<DongchediTrimListData>(
      "dongchedi",
      "list-trims",
      { seriesId: draft.dongchedi.seriesId, status: "online" },
    );
    const reviews = await call<DongchediOwnerReviewsData>(
      "dongchedi",
      "get-owner-reviews",
      { seriesId: draft.dongchedi.seriesId, limit: limits.ownerReviewsPerSeries },
    );
    const trim = cheapestTrim(trims.data?.items ?? []);
    if (!trim) {
      addWarning({
        code: "no_exact_trim",
        message: `series '${draft.name}' had no validated on-sale trim`,
      });
      continue;
    }
    let configuration: CallResult<DongchediConfigurationData> | undefined;
    if (configuredTrims < limits.exactConfigurations) {
      configuration = await call<DongchediConfigurationData>(
        "dongchedi",
        "get-trim-configuration",
        { trimId: trim.trimId },
      );
      if (configuration.data) {
        configuredTrims += 1;
      }
    }
    const exactConfiguration = configuration?.data;
    const vehiclePrice = parsePriceRangeCny(
      trim.dealerPrice || trim.ownerPrice || trim.officialPrice,
    );
    const sourceEvidenceIds = unique([
      ...draft.evidenceIds,
      ...series.evidenceIds,
      ...trims.evidenceIds,
      ...reviews.evidenceIds,
      ...(configuration?.evidenceIds ?? []),
    ]);
    const onRoadCost = calculateOnRoadCost({
      market: brief.market.city,
      seriesId: draft.dongchedi.seriesId,
      trimId: trim.trimId,
      ...(vehiclePrice ? { vehicleReferencePrice: vehiclePrice } : {}),
      vehicleEvidenceIds: trims.evidenceIds,
      costEvidence: brief.costEvidence ?? [],
    });
    const crossSource: CrossSourceMatch = crossSourceMatch({
      dongchedi: draft.dongchedi,
      autohomeMatches: draft.autohomeMatches,
    });
    const criterionResults = evaluateCriteria(brief.criteria, {
      onRoadCost,
      ...(draft.autohomeScore?.level ? { bodyStyle: draft.autohomeScore.level } : {}),
      drivingAssistance: exactConfiguration?.drivingAssistance ?? null,
      budgetEvidenceIds: onRoadCost.evidenceIds,
      bodyStyleEvidenceIds: draft.autohomeScore ? draft.evidenceIds : [],
      configurationEvidenceIds: configuration?.evidenceIds ?? [],
    });
    const eligibility = candidateEligibility(criterionResults);
    builtCandidates.push({
      candidateId: `dongchedi:${draft.dongchedi.seriesId}:trim:${trim.trimId}`,
      eligibility,
      series: {
        name: series.data?.name ?? draft.name,
        brand: series.data?.brand ?? draft.brand,
        dongchediSeriesId: draft.dongchedi.seriesId,
        ...(draft.autohomeMatches.length === 1
          ? { autohomeSeriesId: draft.autohomeMatches[0]!.seriesId }
          : {}),
        ...(draft.autohomeScore?.level ? { bodyStyle: draft.autohomeScore.level } : {}),
        ...(draft.guidePrice ? { guidePrice: draft.guidePrice } : {}),
        ...(series.data?.officialPrice ? { officialPrice: series.data.officialPrice } : {}),
        ...(series.data?.dealerPrice ? { dealerPrice: series.data.dealerPrice } : {}),
        sourceUrls: unique([
          ...draft.sourceUrls,
          ...(series.data?.sourceUrl ? [series.data.sourceUrl] : []),
          trim.sourceUrl,
        ]),
      },
      trim,
      crossSource,
      ...(series.data ? { seriesOverview: series.data } : {}),
      ownerReviews: reviews.data?.items ?? [],
      configuration: exactConfiguration?.configuration ?? [],
      drivingAssistance: exactConfiguration?.drivingAssistance ?? null,
      onRoadCost,
      criterionResults,
      sourceRatings: {
        ...(series.data ? { dongchedi: series.data.score } : {}),
        ...(draft.autohomeScore ? { autohome: draft.autohomeScore.overallScore } : {}),
      },
      evidenceCompleteness: evidenceCompleteness(criterionResults),
      evidenceIds: unique([...sourceEvidenceIds, ...onRoadCost.evidenceIds, ...crossSource.evidenceIds]),
    });
  }

  builtCandidates.sort(compareCandidates);
  const accepted = builtCandidates
    .filter((candidate) => candidate.eligibility !== "rejected")
    .slice(0, limits.finalCandidates);
  const rejected = builtCandidates.filter((candidate) => candidate.eligibility === "rejected");
  const unsupportedCriteria = brief.criteria.filter((criterion) => !isSupportedCriterion(criterion.key));
  const limitations = [
    `research used at most ${limits.initialSeeds} initial seeds and ${limits.expandedSeries} expanded series`,
    `only Dongchedi and Autohome operations registered in SourcePort were used`,
    `at most ${limits.scannedSeries} series and ${limits.exactConfigurations} exact configurations were inspected`,
    "source prices are reference evidence and are not a Wuhan dealer quotation unless supplied as applicable cost evidence",
    "unmatched brands, series, trims, and unsupported criteria were not inferred",
  ];
  const warningList = [...warnings.values()];
  const recoveryList = [...recoveryActions.values()];
  const hasUsableCandidates = accepted.length > 0;
  const status: CarResearchReport["status"] = hasUsableCandidates
    ? warningList.length > 0 || recoveryList.length > 0 || unsupportedCriteria.length > 0 ||
      accepted.some((candidate) => candidate.eligibility === "needs-verification")
      ? "partial"
      : "success"
    : blockedCalls > 0
      ? "blocked"
      : "failed";
  return {
    status,
    query: brief.query,
    market: brief.market,
    generatedAt: now().toISOString(),
    coverage: {
      mode: "bounded",
      limits,
      attemptedSeeds: Math.min(brief.seeds.length, limits.initialSeeds),
      validatedSeeds,
      expandedSeries: pool.length,
      scannedSeries,
      configuredTrims,
      limitations,
    },
    candidates: accepted,
    rejected,
    unsupportedCriteria,
    warnings: warningList,
    recoveryActions: recoveryList,
    evidence: [...evidence.values()],
    ...(!hasUsableCandidates
      ? {
          failure: {
            code: "no_validated_candidates" as const,
            message: blockedCalls > 0
              ? "research could not produce candidates because required source operations were blocked"
              : "research produced no validated exact-trim candidates",
          },
        }
      : {}),
  };
}
