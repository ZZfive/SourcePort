import { describe, expect, it } from "vitest";

import type { EvidenceRecord, SourceRequest, SourceResult } from "@sourceport/core";

import type { CostEvidence } from "./contracts.js";
import { researchCars } from "./engine.js";

const retrievedAt = "2026-07-25T00:00:00.000Z";

function success(request: SourceRequest, data: unknown): SourceResult {
  const discriminator = (request.parameters as Record<string, unknown>)["seriesId"] ??
    (request.parameters as Record<string, unknown>)["trimId"] ??
    (request.parameters as Record<string, unknown>)["keyword"] ??
    (request.parameters as Record<string, unknown>)["brand"] ?? "all";
  const id = `ev-${request.source}-${request.operation}-${String(discriminator)}`;
  const evidence: EvidenceRecord = {
    id,
    source: request.source,
    operation: request.operation,
    backend: "fixture",
    retrievedAt,
    sourceUrl: `https://fixture.invalid/${request.source}/${request.operation}/${String(discriminator)}`,
    fragment: data,
    verification: "source-verified",
  };
  return {
    requestId: request.requestId ?? "fixture",
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: "1.0.0",
    status: "success",
    data,
    backend: "fixture",
    retrievedAt,
    freshness: { isLive: true, ageMs: 0 },
    evidence: [evidence],
    warnings: [],
    recoveryActions: [],
  };
}

function fixtureExecutor(request: SourceRequest): Promise<SourceResult> {
  const parameters = request.parameters as Record<string, unknown>;
  if (request.source === "dongchedi" && request.operation === "search-series") {
    const name = String(parameters["keyword"]);
    const id = name === "车型A" ? "1" : name === "车型B" ? "2" : "0";
    return Promise.resolve(success(request, {
      total: id === "0" ? 0 : 1,
      items: id === "0" ? [] : [{
        rank: 1,
        seriesId: id,
        name,
        brand: "品牌",
        officialPrice: id === "1" ? "11.98-13.98万" : "15.98-17.98万",
        dealerPrice: "",
        pictureCount: 1,
        sourceUrl: `https://www.dongchedi.com/auto/series/${id}`,
      }],
    }));
  }
  if (request.source === "autohome" && request.operation === "list-brand-series") {
    return Promise.resolve(success(request, {
      brand: "品牌",
      items: [
        { seriesId: "101", name: "车型A", guidePrice: "11.98-13.98万", sourceUrl: "https://www.autohome.com.cn/101/" },
        { seriesId: "102", name: "车型B", guidePrice: "15.98-17.98万", sourceUrl: "https://www.autohome.com.cn/102/" },
      ],
    }));
  }
  if (request.source === "autohome" && request.operation === "get-series-score") {
    const id = String(parameters["seriesId"]);
    return Promise.resolve(success(request, {
      seriesId: id,
      name: id === "101" ? "车型A" : "车型B",
      brand: "品牌",
      level: id === "101" ? "紧凑型SUV" : "紧凑型车",
      guidePrice: id === "101" ? "11.98-13.98万" : "15.98-17.98万",
      overallScore: id === "101" ? 4.5 : 4.2,
      dimensions: [],
      reliability: { pph: null, reviewUsers: 100 },
      competitors: [],
      sourceUrl: `https://k.autohome.com.cn/${id}`,
    }));
  }
  if (request.source === "dongchedi" && request.operation === "get-series") {
    const id = String(parameters["seriesId"]);
    return Promise.resolve(success(request, {
      seriesId: id,
      name: id === "1" ? "车型A" : "车型B",
      brand: "品牌",
      subBrand: "",
      officialPrice: id === "1" ? "11.98-13.98万" : "15.98-17.98万",
      dealerPrice: "",
      usedPrice: "",
      score: id === "1" ? 4.4 : 4.1,
      reviewCount: 100,
      saleRank: "",
      scoreRank: "",
      onSaleTrimCount: 1,
      sourceUrl: `https://www.dongchedi.com/auto/series/${id}`,
    }));
  }
  if (request.source === "dongchedi" && request.operation === "list-trims") {
    const id = String(parameters["seriesId"]);
    const trimId = id === "1" ? "11" : "22";
    return Promise.resolve(success(request, {
      seriesId: id,
      status: "online",
      items: [{
        trimId,
        name: id === "1" ? "车型A 智驾版" : "车型B 标准版",
        year: "2026",
        officialPrice: id === "1" ? "12.50万" : "16.50万",
        dealerPrice: "",
        ownerPrice: "",
        sourceUrl: `https://www.dongchedi.com/model-${trimId}`,
        configurationUrl: `https://www.dongchedi.com/params-${trimId}`,
      }],
    }));
  }
  if (request.source === "dongchedi" && request.operation === "get-owner-reviews") {
    const id = String(parameters["seriesId"]);
    return Promise.resolve(success(request, {
      seriesId: id,
      items: [{ reviewId: `9${id}`, excerpt: "fixture owner review" }],
    }));
  }
  if (request.source === "dongchedi" && request.operation === "get-trim-configuration") {
    const trimId = String(parameters["trimId"]);
    const available = trimId === "11";
    return Promise.resolve(success(request, {
      identity: {
        seriesId: available ? "1" : "2",
        seriesName: available ? "车型A" : "车型B",
        trimId,
        trimName: available ? "车型A 智驾版" : "车型B 标准版",
        year: "2026",
        brand: "品牌",
        officialPrice: available ? "12.50万" : "16.50万",
        dealerPrice: "",
        sourceUrl: `https://www.dongchedi.com/params-${trimId}`,
      },
      configuration: [],
      drivingAssistance: {
        claimedAutomationLevel: available
          ? { key: "level", label: "辅助驾驶级别", value: "L2级", availability: "value", configPrice: "" }
          : null,
        operatingDomains: {},
        capabilities: {
          longitudinal: available
            ? [{ key: "adaptive_cruise", label: "自适应巡航", value: "标配", availability: "standard", configPrice: "" }]
            : [],
          lateral: [],
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
    }));
  }
  throw new Error(`unexpected fixture operation ${request.source}.${request.operation}`);
}

function costs(): CostEvidence[] {
  const common: CostEvidence[] = [
    {
      id: "tax",
      component: "purchase-tax",
      minimumCny: 0,
      maximumCny: 0,
      mandatory: true,
      source: "fixture policy",
      retrievedAt,
      market: "武汉",
      applicability: "fixture",
    },
    {
      id: "insurance",
      component: "insurance",
      minimumCny: 5000,
      maximumCny: 6000,
      mandatory: true,
      source: "fixture quote",
      retrievedAt,
      market: "武汉",
      applicability: "fixture",
    },
    {
      id: "registration",
      component: "registration",
      minimumCny: 500,
      maximumCny: 500,
      mandatory: true,
      source: "fixture fee",
      retrievedAt,
      market: "武汉",
      applicability: "fixture",
    },
  ];
  return [
    ...common,
    {
      id: "vehicle-a",
      component: "vehicle-price",
      minimumCny: 120000,
      maximumCny: 125000,
      mandatory: true,
      source: "fixture dealer",
      retrievedAt,
      market: "武汉",
      applicability: "exact fixture trim",
      appliesTo: { trimId: "11" },
    },
    {
      id: "vehicle-b",
      component: "vehicle-price",
      minimumCny: 155000,
      maximumCny: 160000,
      mandatory: true,
      source: "fixture dealer",
      retrievedAt,
      market: "武汉",
      applicability: "exact fixture trim",
      appliesTo: { trimId: "22" },
    },
  ];
}

describe("bounded car research engine", () => {
  it("validates seeds, cross-checks sources, evaluates exact trims, and rejects a proven budget failure", async () => {
    const report = await researchCars({
      query: "武汉15万落地，辅助驾驶优先，SUV优先",
      market: { country: "CN", city: "武汉", currency: "CNY" },
      criteria: [
        { key: "budget.onRoad.maxCny", label: "15万落地", kind: "hard", priority: 100, requirement: { maxCny: 150000 } },
        { key: "drivingAssistance.capabilities", label: "自适应巡航", kind: "preference", priority: 90, requirement: ["自适应巡航"] },
        { key: "bodyStyle.preferred", label: "SUV优先", kind: "preference", priority: 80, requirement: ["SUV"] },
        { key: "ownership.privateCharger", label: "没有私桩", kind: "context", priority: 70, requirement: false },
        { key: "future.filter", label: "未来条件", kind: "preference", priority: 1, requirement: true },
      ],
      seeds: [
        { kind: "series", name: "车型A", brand: "品牌" },
        { kind: "series", name: "车型B", brand: "品牌" },
      ],
      costEvidence: costs(),
      limits: {
        initialSeeds: 2,
        expandedSeries: 4,
        scannedSeries: 2,
        exactConfigurations: 2,
        finalCandidates: 2,
        ownerReviewsPerSeries: 1,
      },
    }, {
      execute: fixtureExecutor,
      now: () => new Date(retrievedAt),
    });

    expect(report.status).toBe("partial");
    expect(report.coverage).toEqual(expect.objectContaining({
      mode: "bounded",
      attemptedSeeds: 2,
      validatedSeeds: 2,
      scannedSeries: 2,
      configuredTrims: 2,
    }));
    expect(report.candidates).toHaveLength(1);
    expect(report.candidates[0]).toEqual(expect.objectContaining({
      eligibility: "eligible",
      series: expect.objectContaining({
        name: "车型A",
        bodyStyle: "紧凑型SUV",
      }),
      crossSource: expect.objectContaining({ status: "matched" }),
      onRoadCost: expect.objectContaining({ status: "known" }),
    }));
    expect(report.candidates[0]?.criterionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterion: expect.objectContaining({ key: "budget.onRoad.maxCny" }), status: "pass" }),
      expect.objectContaining({ criterion: expect.objectContaining({ key: "drivingAssistance.capabilities" }), status: "pass" }),
      expect.objectContaining({ criterion: expect.objectContaining({ key: "future.filter" }), status: "unsupported" }),
    ]));
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0]?.criterionResults).toEqual(expect.arrayContaining([
      expect.objectContaining({ criterion: expect.objectContaining({ key: "budget.onRoad.maxCny" }), status: "fail" }),
    ]));
    expect(report.unsupportedCriteria.map((criterion) => criterion.key)).toEqual(["future.filter"]);
    expect(report.coverage.limitations.join(" ")).toContain("not a Wuhan dealer quotation");
  });
});
