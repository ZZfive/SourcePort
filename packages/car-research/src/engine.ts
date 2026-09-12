import { createHash, randomUUID } from "node:crypto";

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
  effectiveCriteria,
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
  identity?: { seriesId: string; trimId: string; year: string };
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
  origins?: Array<"seed" | "lead" | "catalog" | "competitor">;
  skipReason?: string;
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
  const criteria = effectiveCriteria(brief);
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
    let result: SourceResult;
    try {
      result = await dependencies.execute({
        requestId: randomUUID(),
        source,
        operation,
        parameters,
        ...(brief.freshness ? { freshness: brief.freshness } : {}),
        ...(brief.execution ? { execution: brief.execution } : {}),
      });
    } catch (error) {
      result = {
        requestId: randomUUID(),
        source,
        operation,
        operationSchemaVersion: "unknown",
        status: "failed",
        evidence: [],
        warnings: [],
        failure: {
          code: "internal_error",
          message: error instanceof Error ? error.message : "source executor threw an unknown error",
          stage: "transport",
          retryable: false,
        },
        recoveryActions: [],
      };
    }
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

  for (const item of brief.deliveryEvidence ?? []) evidence.set(item.id, {
    id: item.id, source: item.source, operation: "car-research-delivery-evidence", backend: "brief",
    retrievedAt: item.retrievedAt, sourceUrl: item.sourceUrl, market: item.market, fragment: item, verification: "claimed",
  });
  const pool: DraftSeries[] = [];
  const addDraft = (candidate: DraftSeries) => {
    const existing = pool.find((item) =>
      draftKey(item.name, item.brand) === draftKey(candidate.name, candidate.brand) ||
      (normalizeCarName(item.name) === normalizeCarName(candidate.name) &&
        (!item.brand || !candidate.brand)));
    if (existing) {
      existing.origins = unique([...(existing.origins ?? []), ...(candidate.origins ?? [])]);
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
    pool.push(candidate);
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
  for (const [seedOrder, seed] of brief.seeds.entries()) {
    if (seedOrder >= limits.initialSeeds) {
      addDraft({ name: seed.kind === "series" ? seed.name : seed.brand, brand: seed.kind === "series" ? seed.brand ?? "" : seed.brand,
        seedOrder, origins: ["seed"], skipReason: "initial seed query budget exhausted", guidePrice: "", autohomeMatches: [], evidenceIds: [], sourceUrls: [] });
      continue;
    }
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
          origins: ["seed"],
          guidePrice: item.officialPrice,
          dongchedi: identityFromDongchedi(item, search.evidenceIds),
          autohomeMatches: [],
          evidenceIds: search.evidenceIds,
          sourceUrls: [item.sourceUrl],
        });
        seedValidated = true;
      } else {
        addDraft({ name: seed.name, brand: seed.brand ?? "", seedOrder, origins: ["seed"],
          skipReason: exact.length > 1 ? "conflicting seed identities" : "seed identity unresolved",
          guidePrice: "", autohomeMatches: [], evidenceIds: search.evidenceIds, sourceUrls: candidates.map((item) => item.sourceUrl) });
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
        const identity = identityFromAutohome(item, seed.brand, catalog.evidenceIds);
        addDraft({
          name: item.name,
          brand: seed.brand,
          seedOrder,
          origins: ["catalog"],
          guidePrice: item.guidePrice,
          autohomeMatches: [identity],
          evidenceIds: catalog.evidenceIds,
          sourceUrls: [item.sourceUrl],
        });
        seedValidated = true;
      }
      if (!seedValidated) {
        addDraft({ name: seed.brand, brand: seed.brand, seedOrder, origins: ["seed"],
          skipReason: "brand catalogue returned no series", guidePrice: "", autohomeMatches: [],
          evidenceIds: catalog.evidenceIds, sourceUrls: [] });
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
    draft.evidenceIds = unique([...draft.evidenceIds, ...search.evidenceIds]);
    draft.sourceUrls = unique([...draft.sourceUrls, ...(search.data?.items ?? []).map((item) => item.sourceUrl)]);
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

  // User-supplied recent-release leads are retained as discovery evidence, never as
  // proof of trim equipment, price, or delivery.
  for (const [index, lead] of (brief.discovery?.leads ?? []).entries()) {
    const id = `lead:${createHash("sha256").update(JSON.stringify(lead)).digest("hex")}`;
    evidence.set(id, { id, source: lead.source, operation: "car-research-discovery-lead", backend: "brief",
      sourceUrl: lead.sourceUrl, retrievedAt: lead.retrievedAt, fragment: lead, verification: "claimed" });
    addDraft({ name: lead.name, brand: lead.brand, seedOrder: brief.seeds.length + index, origins: ["lead"],
      guidePrice: "", autohomeMatches: [], evidenceIds: [id], sourceUrls: [lead.sourceUrl] });
  }
  const brands = unique([
    ...brief.seeds.slice(0, limits.initialSeeds).map((seed) => seed.brand ?? ""),
    ...(brief.discovery?.brands ?? []), ...(brief.discovery?.leads ?? []).map((lead) => lead.brand),
    ...pool.map((draft) => draft.brand),
  ]).filter(Boolean);
  // Enumerate each relevant brand, including models absent from older competitor graphs.
  for (const brand of brands) {
    const catalog = await brandCatalog(brand);
    for (const item of catalog.data?.items ?? []) addDraft({
      name: item.name, brand, seedOrder: Number.MAX_SAFE_INTEGER, origins: ["catalog"], guidePrice: item.guidePrice,
      autohomeMatches: [identityFromAutohome(item, brand, catalog.evidenceIds)],
      evidenceIds: catalog.evidenceIds, sourceUrls: [item.sourceUrl],
    });
  }
  for (const draft of pool.filter((item) => item.dongchedi && item.origins?.includes("seed")).slice(0, limits.scannedSeries)) {
    await resolveAutohome(draft);
    await scoreFor(draft);
    for (const competitor of draft.autohomeScore?.competitors ?? []) addDraft({
      name: competitor.name, brand: "", seedOrder: Number.MAX_SAFE_INTEGER, origins: ["competitor"], guidePrice: "",
      autohomeMatches: [{ seriesId: competitor.seriesId, name: competitor.name, brand: "", evidenceIds: draft.evidenceIds,
        sourceUrl: `https://www.autohome.com.cn/${competitor.seriesId}/`, guidePrice: "" }],
      evidenceIds: draft.evidenceIds, sourceUrls: [`https://www.autohome.com.cn/${competitor.seriesId}/`],
    });
  }
  const explicit = pool.filter((draft) => draft.origins?.some((origin) => origin === "seed" || origin === "lead"))
    .sort((a, b) => a.seedOrder - b.seedOrder);
  const remaining = pool.filter((draft) => !explicit.includes(draft));
  const grouped = new Map<string, DraftSeries[]>();
  for (const draft of remaining) grouped.set(draft.brand, [...(grouped.get(draft.brand) ?? []), draft]);
  const orderedDrafts = [...explicit];
  // Round-robin brand catalogs so an early, large brand cannot occupy every slot.
  for (let round = 0; [...grouped.values()].some((items) => round < items.length); round += 1) {
    for (const items of grouped.values()) if (items[round]) orderedDrafts.push(items[round]!);
  }
  const admitted = orderedDrafts.filter((draft) => !draft.skipReason).slice(0, limits.expandedSeries);
  const prepared: Array<{
    draft: DraftSeries;
    series: CallResult<DongchediSeriesOverview>;
    trims: CallResult<DongchediTrimListData>;
    reviews: CallResult<DongchediOwnerReviewsData>;
    rankedTrims: DongchediTrim[];
    configurations: Map<string, CallResult<DongchediConfigurationData>>;
  }> = [];
  let scannedSeries = 0;
  let configuredTrims = 0;
  let configurationAttempts = 0;
  const scanned = new Set<DraftSeries>();
  const identityAttempts = new Set<DraftSeries>();
  for (const draft of admitted) {
    if (scannedSeries >= limits.scannedSeries) break;
    identityAttempts.add(draft);
    await resolveDongchedi(draft);
    if (!draft.dongchedi) continue;
    scanned.add(draft);
    scannedSeries += 1;
    await resolveAutohome(draft);
    await scoreFor(draft);
    const series = await call<DongchediSeriesOverview>("dongchedi", "get-series", { seriesId: draft.dongchedi.seriesId });
    const trims = await call<DongchediTrimListData>("dongchedi", "list-trims", { seriesId: draft.dongchedi.seriesId, status: "online" });
    const reviews = await call<DongchediOwnerReviewsData>("dongchedi", "get-owner-reviews", { seriesId: draft.dongchedi.seriesId, limit: limits.ownerReviewsPerSeries });
    const rankedTrims = [...(trims.data?.items ?? [])].sort((left, right) => {
      const signal = (item: DongchediTrim) => /智驾|智能驾驶|辅助驾驶|领航|激光雷达|高阶/i.test(item.name) ? 0 : 1;
      const price = (item: DongchediTrim) => parsePriceRangeCny(item.dealerPrice || item.ownerPrice || item.officialPrice)?.minimumCny ?? Infinity;
      return signal(left) - signal(right) || price(left) - price(right) || left.trimId.localeCompare(right.trimId);
    });
    if (!rankedTrims.length) {
      addWarning({ code: "no_exact_trim", message: `series '${draft.name}' had no returned on-sale trim; presale and delivery remain unresolved` });
    }
    prepared.push({ draft, series, trims, reviews, rankedTrims, configurations: new Map() });
  }

  // Keep the global I/O budget. Each series gets its first opportunity before any
  // gets a second; failures still consume budget and remain in the evidence log.
  for (let round = 0; prepared.some((item) => item.rankedTrims[round]); round += 1) {
    if (configurationAttempts >= limits.exactConfigurations) break;
    for (const item of prepared) {
      const trim = item.rankedTrims[round];
      if (!trim || configurationAttempts >= limits.exactConfigurations) continue;
      configurationAttempts += 1;
      const fetched = await call<DongchediConfigurationData>("dongchedi", "get-trim-configuration", { trimId: trim.trimId });
      if (fetched.data?.identity && (fetched.data.identity.trimId !== trim.trimId ||
        fetched.data.identity.seriesId !== item.draft.dongchedi!.seriesId || fetched.data.identity.year !== trim.year)) {
        addWarning({ code: "configuration_identity_conflict", message: `configuration identity did not match '${trim.trimId}' and its series/year` });
        fetched.data = undefined;
      }
      item.configurations.set(trim.trimId, fetched);
      if (fetched.data) configuredTrims += 1;
    }
  }
  const builtCandidates: CarCandidate[] = [];
  const evaluatedTrims: CarCandidate[] = [];
  for (const { draft, series, trims, reviews, rankedTrims, configurations } of prepared) {
    const crossSource: CrossSourceMatch = crossSourceMatch({ dongchedi: draft.dongchedi!, autohomeMatches: draft.autohomeMatches });
    const candidates = rankedTrims.map((trim): CarCandidate => {
      const configuration = configurations.get(trim.trimId);
      const exactConfiguration = configuration?.data;
      const vehiclePrice = parsePriceRangeCny(trim.dealerPrice || trim.ownerPrice || trim.officialPrice);
      const onRoadCost = calculateOnRoadCost({ market: brief.market.city, seriesId: draft.dongchedi!.seriesId, trimId: trim.trimId,
        ...(vehiclePrice ? { vehicleReferencePrice: vehiclePrice } : {}), vehicleEvidenceIds: trims.evidenceIds, costEvidence: brief.costEvidence ?? [] });
      const criterionResults = evaluateCriteria(criteria, {
        onRoadCost, ...(draft.autohomeScore?.level ? { bodyStyle: draft.autohomeScore.level } : {}),
        drivingAssistance: exactConfiguration?.drivingAssistance ?? null,
        budgetEvidenceIds: onRoadCost.evidenceIds, bodyStyleEvidenceIds: draft.autohomeScore ? draft.evidenceIds : [],
        configurationEvidenceIds: configuration?.evidenceIds ?? [],
        delivery: { evidence: brief.deliveryEvidence ?? [], market: brief.market.city, seriesId: draft.dongchedi!.seriesId,
          trimId: trim.trimId, now: now().toISOString() },
      });
      return {
        candidateId: `dongchedi:${draft.dongchedi!.seriesId}:trim:${trim.trimId}`,
        eligibility: candidateEligibility(criterionResults),
        configurationStatus: exactConfiguration ? "acquired" : configuration ? "failed" : "not-inspected",
        series: { name: series.data?.name ?? draft.name, brand: series.data?.brand ?? draft.brand,
          dongchediSeriesId: draft.dongchedi!.seriesId,
          ...(draft.autohomeMatches.length === 1 ? { autohomeSeriesId: draft.autohomeMatches[0]!.seriesId } : {}),
          ...(draft.autohomeScore?.level ? { bodyStyle: draft.autohomeScore.level } : {}),
          ...(draft.guidePrice ? { guidePrice: draft.guidePrice } : {}),
          ...(series.data?.officialPrice ? { officialPrice: series.data.officialPrice } : {}),
          ...(series.data?.dealerPrice ? { dealerPrice: series.data.dealerPrice } : {}),
          sourceUrls: unique([...draft.sourceUrls, ...(series.data?.sourceUrl ? [series.data.sourceUrl] : []), trim.sourceUrl]) },
        trim, crossSource, ...(series.data ? { seriesOverview: series.data } : {}), ownerReviews: reviews.data?.items ?? [],
        configuration: exactConfiguration?.configuration ?? [], drivingAssistance: exactConfiguration?.drivingAssistance ?? null,
        onRoadCost, criterionResults,
        sourceRatings: { ...(series.data ? { dongchedi: series.data.score } : {}), ...(draft.autohomeScore ? { autohome: draft.autohomeScore.overallScore } : {}) },
        evidenceCompleteness: evidenceCompleteness(criterionResults),
        evidenceIds: unique([...draft.evidenceIds, ...series.evidenceIds, ...trims.evidenceIds, ...reviews.evidenceIds,
          ...(configuration?.evidenceIds ?? []), ...onRoadCost.evidenceIds, ...crossSource.evidenceIds, ...criterionResults.flatMap((item) => item.evidenceIds)]),
      };
    });
    evaluatedTrims.push(...candidates);
    candidates.sort(compareCandidates);
    const selected = candidates[0];
    if (!selected) continue;
    selected.alternatives = candidates.filter((candidate) => candidate.candidateId !== selected.candidateId).map((candidate) => ({
      trimId: candidate.trim.trimId, name: candidate.trim.name, year: candidate.trim.year,
      price: candidate.trim.dealerPrice || candidate.trim.ownerPrice || candidate.trim.officialPrice,
      selectionStatus: "not-selected", configurationStatus: candidate.configurationStatus!, criterionResults: candidate.criterionResults,
      evidenceIds: candidate.evidenceIds,
      reason: candidate.configurationStatus === "not-inspected" ? "configuration not inspected: global query budget exhausted"
        : candidate.configurationStatus === "failed" ? "configuration acquisition failed; criteria remain unresolved"
        : candidate.eligibility === "rejected" ? "evidence-backed hard condition failed for this exact trim"
        : "another trim precedes this trim under the recorded criterion ordering and tie-breakers",
    }));
    if (candidates.some((candidate) => candidate.configurationStatus !== "acquired")) {
      addWarning({ code: "incomplete_trim_comparison", message: `series '${draft.name}' has uninspected or failed configurations; selected trim is provisional` });
    }
    builtCandidates.push(selected);
  }
  builtCandidates.sort(compareCandidates);
  const accepted = builtCandidates.filter((candidate) => candidate.eligibility !== "rejected").slice(0, limits.finalCandidates);
  const rejected = builtCandidates.filter((candidate) => candidate.eligibility === "rejected");
  const discoveredSeries = orderedDrafts.map((draft) => ({
    name: draft.name, brand: draft.brand, origins: draft.origins ?? [],
    ...(draft.dongchedi ? { dongchediSeriesId: draft.dongchedi.seriesId } : {}),
    ...(draft.autohomeMatches.length === 1 ? { autohomeSeriesId: draft.autohomeMatches[0]!.seriesId } : {}),
    status: scanned.has(draft) ? (prepared.find((item) => item.draft === draft)?.rankedTrims.length ? "scanned" as const : "no-trims" as const)
      : (draft.skipReason && !draft.skipReason.includes("budget")) || (identityAttempts.has(draft) && !draft.dongchedi) ? "unresolved" as const : "not-scanned" as const,
    reason: draft.skipReason ?? (scanned.has(draft) ? "series queried; inspect evaluatedTrims for configuration coverage"
      : !admitted.includes(draft) ? "expanded series query budget exhausted" : identityAttempts.has(draft) && !draft.dongchedi
        ? "exact source identity unresolved" : "scanned series query budget exhausted"),
    sourceUrls: draft.sourceUrls, evidenceIds: draft.evidenceIds,
  }));
  const unsupportedCriteria = criteria.filter((criterion) => !isSupportedCriterion(criterion.key));
  const limitations = [
    `research queried at most ${limits.initialSeeds} initial seeds; remaining seeds are retained without queries`,
    `discovery uses explicit seeds, supplied release leads, relevant brand catalogs and bounded competitor links; not a complete market census`,
    `${discoveredSeries.length} series retained; at most ${limits.expandedSeries} admitted and ${limits.scannedSeries} scanned`,
    `${configurationAttempts} of ${limits.exactConfigurations} global exact-configuration queries used in rounds across series`,
    `finalCandidates=${limits.finalCandidates} is a presentation limit; allCandidates and evaluatedTrims retain the rest`,
    "ordering uses hard-condition eligibility, preferences by priority, then tied capability pass counts, evidence completeness, source ratings and stable IDs; it is not a driving-quality score",
    "source reference prices exclude unverified mandatory costs; only applicable cost evidence can establish an on-road total",
    "presale, announcement and on-sale status do not establish delivery before the requested deadline",
  ];
  if (discoveredSeries.some((item) => item.status !== "scanned")) addWarning({ code: "incomplete_discovery", message: "some discovered series are unresolved or unscanned; see discoveredSeries for each reason" });
  if (builtCandidates.filter((item) => item.eligibility !== "rejected").length > accepted.length) addWarning({ code: "presentation_limit", message: "additional non-rejected candidates are retained in allCandidates" });
  const warningList = [...warnings.values()];
  const recoveryList = [...recoveryActions.values()];
  const hasUsableCandidates = accepted.length > 0;
  const status: CarResearchReport["status"] = hasUsableCandidates
    ? warningList.length || recoveryList.length || unsupportedCriteria.length || accepted.some((item) => item.eligibility === "needs-verification") ? "partial" : "success"
    : blockedCalls > 0 ? "blocked" : "failed";
  return {
    status, query: brief.query, market: brief.market,
    decisionContext: { ...(brief.purchaseTiming ? { purchaseTiming: brief.purchaseTiming } : {}), ...(brief.budget ? { budget: brief.budget } : {}), ...(brief.usageContext ? { usageContext: brief.usageContext } : {}) },
    generatedAt: now().toISOString(),
    coverage: { mode: "bounded", limits, attemptedSeeds: Math.min(brief.seeds.length, limits.initialSeeds), validatedSeeds,
      expandedSeries: admitted.length, discoveredSeries: discoveredSeries.length, scannedSeries, configuredTrims, configurationAttempts, limitations },
    candidates: accepted, rejected, allCandidates: builtCandidates, evaluatedTrims, discoveredSeries,
    unsupportedCriteria, warnings: warningList, recoveryActions: recoveryList, evidence: [...evidence.values()],
    ...(!hasUsableCandidates ? { failure: { code: "no_validated_candidates" as const,
      message: blockedCalls > 0 ? "required source operations were blocked" : "research produced no non-rejected exact-trim candidates; inspect retained records" } } : {}),
  };
}
