import { describe, expect, it } from "vitest";

import { researchCars, type CostEvidence } from "@sourceport/car-research";
import type { SourceRequest, SourceResult } from "@sourceport/core";

const retrievedAt = "2026-07-25T08:00:00.000Z";
const models = [
  { dcd: "1", ah: "101", trim: "1001", name: "宋Pro DM-i", brand: "比亚迪", level: "紧凑型SUV", price: "11.28万" },
  { dcd: "2", ah: "102", trim: "1002", name: "银河L7", brand: "吉利银河", level: "紧凑型SUV", price: "12.57万" },
  { dcd: "3", ah: "103", trim: "1003", name: "长安启源Q05", brand: "长安启源", level: "紧凑型SUV", price: "11.99万" },
  { dcd: "4", ah: "104", trim: "1004", name: "风云T9", brand: "奇瑞风云", level: "中型SUV", price: "13.29万" },
  { dcd: "5", ah: "105", trim: "1005", name: "星瑞", brand: "吉利汽车", level: "紧凑型车", price: "12.97万" },
] as const;

function modelBy(field: "dcd" | "ah" | "trim" | "name", value: string) {
  return models.find((model) => model[field] === value);
}

function success(request: SourceRequest, data: unknown): SourceResult {
  const parameters = request.parameters as Record<string, unknown>;
  const discriminator = parameters["seriesId"] ?? parameters["trimId"] ??
    parameters["keyword"] ?? parameters["brand"] ?? "all";
  return {
    requestId: request.requestId ?? "wuhan-fixture",
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: "1.0.0",
    status: "success",
    data,
    backend: "wuhan-fixture",
    retrievedAt,
    freshness: { isLive: true, ageMs: 0 },
    evidence: [{
      id: `wuhan-${request.source}-${request.operation}-${String(discriminator)}`,
      source: request.source,
      operation: request.operation,
      backend: "wuhan-fixture",
      retrievedAt,
      sourceUrl: `https://fixture.invalid/${request.source}/${request.operation}/${String(discriminator)}`,
      fragment: data,
      verification: "source-verified",
    }],
    warnings: [],
    recoveryActions: [],
  };
}

async function execute(request: SourceRequest): Promise<SourceResult> {
  const parameters = request.parameters as Record<string, unknown>;
  if (request.source === "dongchedi" && request.operation === "search-series") {
    const model = modelBy("name", String(parameters["keyword"]));
    return success(request, {
      total: model ? 1 : 0,
      items: model ? [{
        rank: 1,
        seriesId: model.dcd,
        name: model.name,
        brand: model.brand,
        officialPrice: model.price,
        dealerPrice: "",
        pictureCount: 1,
        sourceUrl: `https://www.dongchedi.com/auto/series/${model.dcd}`,
      }] : [],
    });
  }
  if (request.source === "autohome" && request.operation === "list-brand-series") {
    const brand = String(parameters["brand"]);
    return success(request, {
      brand,
      items: models.filter((model) => model.brand === brand).map((model) => ({
        seriesId: model.ah,
        name: model.name,
        guidePrice: model.price,
        sourceUrl: `https://www.autohome.com.cn/${model.ah}/`,
      })),
    });
  }
  if (request.source === "autohome" && request.operation === "get-series-score") {
    const model = modelBy("ah", String(parameters["seriesId"]));
    if (!model) throw new Error("unknown Autohome fixture id");
    return success(request, {
      seriesId: model.ah,
      name: model.name,
      brand: model.brand,
      level: model.level,
      guidePrice: model.price,
      overallScore: 4.2,
      dimensions: [],
      reliability: { pph: null, reviewUsers: 100 },
      competitors: [],
      sourceUrl: `https://k.autohome.com.cn/${model.ah}`,
    });
  }
  if (request.source === "dongchedi" && request.operation === "get-series") {
    const model = modelBy("dcd", String(parameters["seriesId"]));
    if (!model) throw new Error("unknown Dongchedi fixture id");
    return success(request, {
      seriesId: model.dcd,
      name: model.name,
      brand: model.brand,
      subBrand: "",
      officialPrice: model.price,
      dealerPrice: "",
      usedPrice: "",
      score: 4.3,
      reviewCount: 200,
      saleRank: "",
      scoreRank: "",
      onSaleTrimCount: 1,
      sourceUrl: `https://www.dongchedi.com/auto/series/${model.dcd}`,
    });
  }
  if (request.source === "dongchedi" && request.operation === "list-trims") {
    const model = modelBy("dcd", String(parameters["seriesId"]));
    if (!model) throw new Error("unknown trim-list fixture id");
    return success(request, {
      seriesId: model.dcd,
      status: "online",
      items: [{
        trimId: model.trim,
        name: `${model.name} 2026款`,
        year: "2026",
        officialPrice: model.price,
        dealerPrice: "",
        ownerPrice: "",
        sourceUrl: `https://www.dongchedi.com/model-${model.trim}`,
        configurationUrl: `https://www.dongchedi.com/params-${model.trim}`,
      }],
    });
  }
  if (request.source === "dongchedi" && request.operation === "get-owner-reviews") {
    const model = modelBy("dcd", String(parameters["seriesId"]));
    if (!model) throw new Error("unknown review fixture id");
    return success(request, {
      seriesId: model.dcd,
      items: [{ reviewId: `9${model.dcd}`, excerpt: `${model.name} owner review` }],
    });
  }
  if (request.source === "dongchedi" && request.operation === "get-trim-configuration") {
    const model = modelBy("trim", String(parameters["trimId"]));
    if (!model) throw new Error("unknown configuration fixture id");
    return success(request, {
      identity: {
        seriesId: model.dcd,
        seriesName: model.name,
        trimId: model.trim,
        trimName: `${model.name} 2026款`,
        year: "2026",
        brand: model.brand,
        officialPrice: model.price,
        dealerPrice: "",
        sourceUrl: `https://www.dongchedi.com/params-${model.trim}`,
      },
      configuration: [],
      drivingAssistance: {
        claimedAutomationLevel: {
          key: "automatic_drive_level",
          label: "辅助驾驶级别",
          value: "L2级",
          availability: "value",
          configPrice: "",
        },
        operatingDomains: {},
        capabilities: {
          longitudinal: [{
            key: "adaptive_cruise",
            label: "自适应巡航",
            value: "标配",
            availability: "standard",
            configPrice: "",
          }],
          lateral: [{
            key: "lane_center",
            label: "车道居中保持",
            value: "标配",
            availability: "standard",
            configPrice: "",
          }],
          activeSafety: [],
          parking: [],
          monitoring: [],
        },
        hardware: {},
        system: {},
        optionalEquipment: [],
        optionalPackages: [],
        subscription: null,
        ota: null,
        market: "中国",
      },
    });
  }
  throw new Error(`unexpected operation ${request.source}.${request.operation}`);
}

const costEvidence: CostEvidence[] = [
  {
    id: "wuhan-tax-unknown-powertrain",
    component: "purchase-tax",
    minimumCny: 0,
    maximumCny: 10000,
    mandatory: true,
    source: "fixture policy range",
    retrievedAt,
    market: "武汉",
    applicability: "powertrain-specific applicability still requires verification",
  },
  {
    id: "wuhan-insurance-range",
    component: "insurance",
    minimumCny: 5000,
    maximumCny: 7000,
    mandatory: true,
    source: "fixture insurance range",
    retrievedAt,
    market: "武汉",
    applicability: "bounded fixture estimate",
  },
  {
    id: "wuhan-registration",
    component: "registration",
    minimumCny: 500,
    maximumCny: 500,
    mandatory: true,
    source: "fixture registration fee",
    retrievedAt,
    market: "武汉",
    applicability: "bounded fixture estimate",
  },
];

describe("Wuhan bounded car-research fixture E2E", () => {
  it("validates five seeds, resolves exact trims, and keeps unverified Wuhan prices unknown", async () => {
    const report = await researchCars({
      query: "武汉购车，落地不超过15万，没有私桩，辅助驾驶优先，SUV优先但轿车可接受",
      market: { country: "CN", city: "武汉", currency: "CNY" },
      criteria: [
        { key: "budget.onRoad.maxCny", label: "15万落地", kind: "hard", priority: 100, requirement: { maxCny: 150000 } },
        { key: "drivingAssistance.capabilities", label: "辅助驾驶能力", kind: "preference", priority: 90, requirement: ["自适应巡航", "车道居中"] },
        { key: "bodyStyle.preferred", label: "SUV优先", kind: "preference", priority: 80, requirement: ["SUV"] },
        { key: "ownership.privateCharger", label: "没有私人充电桩", kind: "context", priority: 70, requirement: false },
      ],
      seeds: models.map((model) => ({ kind: "series" as const, name: model.name, brand: model.brand })),
      costEvidence,
      limits: {
        initialSeeds: 5,
        expandedSeries: 8,
        scannedSeries: 5,
        exactConfigurations: 3,
        finalCandidates: 5,
        ownerReviewsPerSeries: 1,
      },
    }, {
      execute,
      now: () => new Date(retrievedAt),
    });

    expect(report.status).toBe("partial");
    expect(report.coverage).toEqual(expect.objectContaining({
      attemptedSeeds: 5,
      validatedSeeds: 5,
      scannedSeries: 5,
      configuredTrims: 3,
    }));
    expect(report.candidates).toHaveLength(5);
    expect(report.candidates.filter((candidate) => candidate.drivingAssistance !== null)).toHaveLength(3);
    expect(report.candidates.every((candidate) => candidate.crossSource.status === "matched")).toBe(true);
    expect(report.candidates.every((candidate) => candidate.onRoadCost.status === "unknown")).toBe(true);
    expect(report.candidates.every((candidate) =>
      candidate.criterionResults.some((result) =>
        result.criterion.key === "budget.onRoad.maxCny" && result.status === "unknown"))).toBe(true);
    expect(report.coverage.limitations.join(" ")).toContain("at most 5 initial seeds");
  });
});
