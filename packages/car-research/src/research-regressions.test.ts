import { describe, expect, it } from "vitest";
import type { SourceRequest, SourceResult } from "@sourceport/core";
import { researchCars } from "./engine.js";
import { renderCarResearchMarkdown } from "./markdown.js";
import { enrichCarResearchReport } from "./enrichment.js";

const now = "2026-09-10T00:00:00Z";
const series = ["A", "B", "银河TT", "新品"];
const trim = (id: string, high: boolean) => ({ trimId: `${id}-${high ? "high" : "low"}`, name: high ? "舒享版" : "标准版", year: "2026",
  officialPrice: high ? "12万" : "10万", dealerPrice: "", ownerPrice: "", sourceUrl: `https://example.org/${id}/${high}`, configurationUrl: `https://example.org/config/${id}/${high}` });
const brief = (limits = {}) => ({
  query: "compare", market: { city: "武汉" },
  criteria: [{ key: "drivingAssistance.capabilities", label: "ACC", kind: "hard", priority: 100, requirement: ["自适应巡航"] }],
  seeds: [{ kind: "series", name: "A", brand: "品牌" }, { kind: "series", name: "B", brand: "品牌" }],
  limits: { initialSeeds: 2, expandedSeries: 2, scannedSeries: 2, exactConfigurations: 4, finalCandidates: 1, ownerReviewsPerSeries: 1, ...limits },
});
function fixture(options: { noTrims?: string; failTrim?: string; mismatch?: string } = {}) {
  const calls: SourceRequest[] = [];
  const execute = async (request: SourceRequest): Promise<SourceResult> => {
    calls.push(request);
    const p = request.parameters as Record<string, string>;
    const id = p["seriesId"]!;
    let data: unknown;
    switch (request.operation) {
      case "search-series": data = { items: series.includes(p["keyword"]!) ? [{ seriesId: p["keyword"], name: p["keyword"], brand: "品牌", officialPrice: "10-12万", dealerPrice: "", sourceUrl: `https://example.org/${p["keyword"]}` }] : [] }; break;
      case "list-brand-series": data = { items: series.slice(0, 3).map((name) => ({ seriesId: name, name, guidePrice: "10-12万", sourceUrl: `https://example.org/${name}` })) }; break;
      case "get-series-score": data = { seriesId: id, name: id, brand: "品牌", level: "SUV", overallScore: null, competitors: [] }; break;
      case "get-series": data = { seriesId: id, name: id, brand: "品牌", score: null, sourceUrl: `https://example.org/${id}` }; break;
      case "list-trims": data = { items: options.noTrims === id ? [] : [trim(id, false), trim(id, true)] }; break;
      case "get-owner-reviews": data = { items: [] }; break;
      case "get-trim-configuration": {
        if (options.failTrim === p["trimId"]) throw new Error("fixture transport failure");
        const [seriesId] = p["trimId"]!.split("-");
        data = { identity: { seriesId, trimId: options.mismatch ?? p["trimId"], year: "2026" }, configuration: [],
          drivingAssistance: { capabilities: { longitudinal: [{ key: "adaptive_cruise", label: "自适应巡航", value: p["trimId"]!.endsWith("high") ? "标配" : null,
            availability: p["trimId"]!.endsWith("high") ? "standard" : "unavailable" }] } } };
        break;
      }
      default: throw new Error(`unexpected ${request.operation}`);
    }
    const evidenceId = `e${calls.length}`;
    return { requestId: evidenceId, source: request.source, operation: request.operation, operationSchemaVersion: "1.0.0", status: "success", data,
      warnings: [], recoveryActions: [], evidence: [{ id: evidenceId, source: request.source, operation: request.operation, backend: "fixture", retrievedAt: now, sourceUrl: `https://example.org/${evidenceId}`, fragment: data, verification: "source-verified" }] };
  };
  return { calls, execute, now: () => new Date(now) };
}

describe("car research coverage and exact-trim regressions", () => {
  it("spends the GLOBAL budget in rounds and chooses the higher trim that actually passes", async () => {
    const f = fixture(); const report = await researchCars(brief(), f);
    expect(f.calls.filter((c) => c.operation === "get-trim-configuration").map((c) => (c.parameters as { trimId: string }).trimId)).toEqual(["A-low", "B-low", "A-high", "B-high"]);
    expect(report.allCandidates?.map((c) => c.trim.trimId)).toEqual(["A-high", "B-high"]);
    expect(report.allCandidates?.every((c) => c.eligibility === "eligible")).toBe(true);
    expect(report.evaluatedTrims?.filter((c) => c.eligibility === "rejected")).toHaveLength(2);
    expect(report.candidates).toHaveLength(1);
    expect(report.allCandidates).toHaveLength(2);
    expect(report.candidates[0]?.alternatives?.map((c) => c.trimId)).toEqual(["A-low"]);
    expect(report.candidates[0]?.series.sourceUrls).toContain("https://example.org/A/true");
    expect(report.warnings.some((w) => w.code === "presentation_limit")).toBe(true);
  });
  it("retains unknown higher trims instead of rejecting their whole series when the budget is exhausted", async () => {
    const f = fixture(); const report = await researchCars(brief({ exactConfigurations: 2 }), f);
    expect(report.coverage.configurationAttempts).toBe(2);
    expect(report.rejected).toHaveLength(0);
    expect(report.allCandidates?.every((c) => c.eligibility === "needs-verification" && c.configurationStatus === "not-inspected")).toBe(true);
    expect(report.evaluatedTrims).toHaveLength(4);
    expect(report.warnings.some((w) => w.code === "incomplete_trim_comparison")).toBe(true);
    expect(enrichCarResearchReport(report, {}).recommendation?.status).toBe("verify-before-buy");
  });
  it("gives the next series its turn even if the first configuration fails", async () => {
    const f = fixture({ failTrim: "A-low" }); const report = await researchCars(brief({ exactConfigurations: 2 }), f);
    expect(report.coverage.configurationAttempts).toBe(2);
    expect(report.coverage.configuredTrims).toBe(1);
    expect(report.evaluatedTrims?.find((c) => c.trim.trimId === "A-low")?.configurationStatus).toBe("failed");
    expect(report.evaluatedTrims?.find((c) => c.trim.trimId === "B-low")?.configurationStatus).toBe("acquired");
  });
  it("enumerates catalog models absent from competitor links and retains unscanned models", async () => {
    const report = await researchCars(brief(), fixture());
    expect(report.discoveredSeries?.find((c) => c.name === "银河TT")).toMatchObject({ status: "not-scanned", origins: ["catalog"], reason: "expanded series query budget exhausted" });
    const expanded = await researchCars(brief({ expandedSeries: 3, scannedSeries: 3, exactConfigurations: 6 }), fixture());
    expect(expanded.allCandidates?.some((c) => c.series.name === "银河TT")).toBe(true);
  });
  it("admits dated release leads and keeps presale/no-trim cases in the ledger", async () => {
    const report = await researchCars({ ...brief({ expandedSeries: 3, scannedSeries: 3 }), discovery: { leads: [{ name: "新品", brand: "品牌", source: "manufacturer", sourceUrl: "https://example.org/release", retrievedAt: now, marketStatus: "presale" }] } }, fixture({ noTrims: "新品" }));
    const entry = report.discoveredSeries?.find((c) => c.name === "新品");
    expect(entry).toMatchObject({ status: "no-trims", origins: ["lead"] });
    expect(report.evidence.find((e) => e.id === entry?.evidenceIds[0])).toMatchObject({ sourceUrl: "https://example.org/release", verification: "claimed" });
    expect(report.discoveredSeries?.some((c) => c.name === "银河TT")).toBe(true);
  });
  it("never evaluates mismatched configuration identity as a valid trim", async () => {
    const report = await researchCars(brief(), fixture({ mismatch: "another-trim" }));
    expect(report.coverage.configuredTrims).toBe(0);
    expect(report.evaluatedTrims?.every((c) => c.configurationStatus === "failed")).toBe(true);
    expect(report.warnings.some((w) => w.code === "configuration_identity_conflict")).toBe(true);
  });
  it("does not display reference-only prices as a verified on-road total", async () => {
    const report = await researchCars(brief(), fixture());
    const md = renderCarResearchMarkdown(report);
    expect(md).toContain("Vehicle reference (excludes costs)");
    expect(md).toContain("Verified on-road total");
    expect(md).toContain("12万 | unknown | vehicle-price, purchase-tax, insurance, registration");
    expect(md).toContain("银河TT");
    expect(md).toContain("presentation limit");
    expect(md).not.toContain("estimate ¥");
  });
  it("promotes purchaseTiming to a real hard condition and keeps missing delivery evidence unknown", async () => {
    const report = await researchCars({ ...brief(), purchaseTiming: { targetDate: "2027-02-05" } }, fixture());
    expect(report.allCandidates?.every((c) => c.criterionResults.some((r) => r.criterion.key === "purchase.deliveryBefore" && r.status === "unknown"))).toBe(true);
    expect(report.allCandidates?.every((c) => c.eligibility === "needs-verification")).toBe(true);
  });
});
