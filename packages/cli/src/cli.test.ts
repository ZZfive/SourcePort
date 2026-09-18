import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SourceExecutor } from "@sourceport/car-research";
import {
  SourceRegistry,
  type CacheKeyInput,
  type CacheReadResult,
  type ResultCache,
  type SourceResult,
} from "@sourceport/core";
import { FakeSourceAdapter } from "@sourceport/testing";

import { runCli } from "./cli.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (value: string) => stdout.push(value),
      stderr: (value: string) => stderr.push(value),
    },
  };
}

function registry() {
  const value = new SourceRegistry();
  value.register(new FakeSourceAdapter());
  return value;
}

const researchBrief = {
  query: "示例城市示例预算落地买车",
  market: { city: "示例城市" },
  criteria: [],
  seeds: [{ kind: "series", name: "车型A" }],
};

const blockedResearchExecutor: SourceExecutor = async (request) => ({
  requestId: request.requestId ?? "blocked",
  source: request.source,
  operation: request.operation,
  operationSchemaVersion: "1.0.0",
  status: "blocked",
  backend: "fixture",
  evidence: [],
  warnings: [],
  failure: {
    code: "auth_required",
    message: "login required",
    stage: "classification",
    retryable: false,
    backend: "fixture",
  },
  recoveryActions: [{
    kind: "login",
    description: "log in and retry",
    requiresUser: true,
    backend: "fixture",
  }],
});

const contextExecutor: SourceExecutor = async (request) => ({
  requestId: request.requestId ?? "context",
  source: request.source,
  operation: request.operation,
  operationSchemaVersion: "1.0.0",
  status: "success",
  data: {
    query: "candidate",
    items: [{ rank: 1, title: "Discovery lead", url: "https://example.com/lead", snippet: "lead only" }],
  },
  backend: "fixture",
  retrievedAt: "2026-07-26T00:00:00.000Z",
  evidence: [{
    id: "context-evidence",
    source: request.source,
    operation: request.operation,
    backend: "fixture",
    retrievedAt: "2026-07-26T00:00:00.000Z",
    verification: "source-verified",
  }],
  warnings: [],
  recoveryActions: [],
});

class MemoryCache implements ResultCache {
  value: CacheReadResult = { status: "miss", reason: "not_found" };

  async read(_key: CacheKeyInput): Promise<CacheReadResult> {
    return this.value;
  }

  async write(_key: CacheKeyInput, result: SourceResult): Promise<void> {
    this.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: result.retrievedAt ?? "2026-07-20T00:00:00.000Z",
      result,
    };
  }
}

describe("SourcePort CLI", () => {
  it("lists sources and capabilities as stable JSON", async () => {
    const sources = capture();
    const sourceExit = await runCli(["sources"], { registry: registry(), ...sources.io });
    const capabilities = capture();
    const capabilityExit = await runCli(["capabilities", "fake"], {
      registry: registry(),
      ...capabilities.io,
    });

    expect(sourceExit).toBe(0);
    expect(JSON.parse(sources.stdout.join(""))).toEqual({
      sources: [expect.objectContaining({ source: "fake" })],
    });
    expect(capabilityExit).toBe(0);
    expect(JSON.parse(capabilities.stdout.join(""))).toEqual({
      source: "fake",
      operations: [expect.objectContaining({ operation: "echo" })],
    });
    expect(sources.stderr).toEqual([]);
  });

  it("runs a source operation and reserves stdout for the result", async () => {
    const output = capture();
    const exitCode = await runCli(
      ["run", "fake", "echo", "--input", JSON.stringify({ value: "x" })],
      { registry: registry(), cache: new MemoryCache(), ...output.io },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(output.stdout.join(""))).toEqual(
      expect.objectContaining({ status: "success", data: { value: "x" } }),
    );
    expect(output.stderr).toEqual([]);
  });

  it("returns a non-zero exit code for invalid JSON input", async () => {
    const output = capture();
    const exitCode = await runCli(["run", "fake", "echo", "--input", "{"], {
      registry: registry(),
      ...output.io,
    });

    expect(exitCode).toBe(2);
    expect(output.stdout).toEqual([]);
    expect(JSON.parse(output.stderr.join(""))).toEqual(
      expect.objectContaining({
        error: expect.objectContaining({ code: "invalid_cli_input" }),
      }),
    );
  });

  it("supports explicit stale-cache execution", async () => {
    const output = capture();
    const cache = new MemoryCache();
    cache.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-20T00:00:00.000Z",
      result: {
        requestId: "cached-request",
        source: "fake",
        operation: "echo",
        operationSchemaVersion: "1.0.0",
        status: "success",
        data: { value: "cached" },
        backend: "fake-memory",
        retrievedAt: "2026-07-20T00:00:00.000Z",
        freshness: { isLive: true, ageMs: 0 },
        evidence: [{
          id: "cached-evidence",
          source: "fake",
          operation: "echo",
          backend: "fake-memory",
          retrievedAt: "2026-07-20T00:00:00.000Z",
          verification: "source-verified",
        }],
        warnings: [],
        recoveryActions: [],
      },
    };

    const exitCode = await runCli([
      "run",
      "fake",
      "echo",
      "--input",
      JSON.stringify({ value: "x" }),
      "--freshness",
      "allow-stale",
      "--max-age-ms",
      "7200000",
    ], {
      registry: registry(),
      cache,
      now: () => new Date("2026-07-20T01:00:00.000Z"),
      ...output.io,
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(output.stdout.join(""))).toEqual(expect.objectContaining({
      status: "stale",
      backend: "cache",
      data: { value: "cached" },
      freshness: { isLive: false, ageMs: 3_600_000 },
    }));
  });

  it("rejects unknown freshness modes as CLI input", async () => {
    const output = capture();
    const exitCode = await runCli([
      "run",
      "fake",
      "echo",
      "--input",
      JSON.stringify({ value: "x" }),
      "--freshness",
      "sometimes",
    ], { registry: registry(), cache: new MemoryCache(), ...output.io });

    expect(exitCode).toBe(2);
    expect(JSON.parse(output.stderr.join(""))).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "invalid_cli_input" }),
    }));
  });

  it("runs bounded car research from inline JSON and preserves blocked recovery", async () => {
    const output = capture();
    const exitCode = await runCli([
      "research-cars",
      "--input",
      JSON.stringify(researchBrief),
    ], {
      registry: registry(),
      researchExecutor: blockedResearchExecutor,
      now: () => new Date("2026-07-25T00:00:00.000Z"),
      ...output.io,
    });

    expect(exitCode).toBe(3);
    expect(JSON.parse(output.stdout.join(""))).toEqual(expect.objectContaining({
      status: "blocked",
      coverage: expect.objectContaining({ mode: "bounded" }),
      recoveryActions: [expect.objectContaining({ kind: "login" })],
    }));
    expect(output.stderr).toEqual([]);
  });

  it("reads a brief from a file and renders Markdown", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-cli-"));
    const inputFile = join(directory, "brief.json");
    const reportFile = join(directory, "report.json");
    await writeFile(inputFile, JSON.stringify(researchBrief), "utf8");
    try {
      const output = capture();
      const exitCode = await runCli([
        "research-cars",
        "--input-file",
        inputFile,
        "--format",
        "md",
        "--report-file",
        reportFile,
      ], {
        registry: registry(),
        researchExecutor: blockedResearchExecutor,
        ...output.io,
      });

      expect(exitCode).toBe(3);
      expect(output.stdout.join("")).toContain("# Car Research Report");
      expect(output.stdout.join("")).toContain("## Coverage limitations");
      expect(JSON.parse(await readFile(reportFile, "utf8"))).toEqual(expect.objectContaining({ status: "blocked" }));
      expect(output.stderr).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects ambiguous car-research input sources", async () => {
    const output = capture();
    const exitCode = await runCli([
      "research-cars",
      "--input",
      JSON.stringify(researchBrief),
      "--input-file",
      "brief.json",
    ], { registry: registry(), ...output.io });

    expect(exitCode).toBe(2);
    expect(JSON.parse(output.stderr.join(""))).toEqual(expect.objectContaining({
      error: expect.objectContaining({ code: "invalid_cli_input" }),
    }));
  });

  it("runs deterministic configurable property research from a brief and candidate fixture", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-property-cli-"));
    const candidatesFile = join(directory, "candidates.json");
    const reportFile = join(directory, "property-report.json");
    const brief = {
      query: "示例城市总包示例预算，新房和二手房，优先三室一厅",
      market: { city: "示例城市" },
      housingTypes: ["new", "resale"],
      budget: { maximumAllInCny: 2_000_000, basis: "all-in" },
      layout: { bedrooms: 3, livingRooms: 1 },
      commuteAnchors: [{ id: "destinationA", label: "通勤目的地 A" }, { id: "destinationB", label: "通勤目的地 B" }],
    };
    await writeFile(candidatesFile, JSON.stringify([{ candidateId: "fixture-1", kind: "new", city: "示例城市", community: "测试小区", bedrooms: 3, livingRooms: 1, purchasePrice: { minimumCny: 1_400_000, maximumCny: 1_400_000 }, commuteMinutes: { destinationA: 40, destinationB: 50 } }]), "utf8");
    try {
      const output = capture();
      const exitCode = await runCli(["research-property", "--input", JSON.stringify(brief), "--candidates-file", candidatesFile, "--format", "md", "--report-file", reportFile], { now: () => new Date("2026-09-18T00:00:00.000Z"), ...output.io });
      expect(exitCode).toBe(1);
      expect(output.stdout.join("")).toContain("# 示例城市买房研究");
      expect(output.stdout.join("")).toContain("通勤目的地 A=40 分钟");
      expect(JSON.parse(await readFile(reportFile, "utf8"))).toEqual(expect.objectContaining({ status: "partial" }));
      expect(output.stderr).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("discovers property candidates from explicit listing queries", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-property-discover-cli-"));
    const briefFile = join(directory, "brief.json");
    const discoveryFile = join(directory, "discovery.json");
    const outputFile = join(directory, "candidates.json");
    const brief = {
      query: "示例城市买房",
      market: { city: "示例城市" },
      housingTypes: ["new", "resale"],
      budget: { maximumAllInCny: 2_000_000, basis: "all-in" },
      commuteAnchors: [{ id: "destinationA", label: "通勤目的地 A" }],
    };
    await writeFile(briefFile, JSON.stringify(brief), "utf8");
    await writeFile(discoveryFile, JSON.stringify([{ source: "fixture-listings", operation: "search-listings", parameters: { url: "https://listings.example.test/search", query: "示例区域", kind: "new", city: "示例城市", limit: 5 } }]), "utf8");
    const execute: SourceExecutor = async (request) => ({
      requestId: request.requestId ?? "discover",
      source: request.source,
      operation: request.operation,
      operationSchemaVersion: "1.0.0",
      status: "success",
      data: { query: "示例区域", kind: "new", items: [{ candidateId: "lead-1", kind: "new", city: "示例城市", community: "测试项目", title: "测试项目", sourceUrl: "https://listings.example.test/lead-1", retrievedAt: "2026-09-18T00:00:00Z", priceCny: { minimumCny: 1_500_000, maximumCny: 1_500_000 }, evidenceStatus: "lead-only" }] },
      evidence: [{ id: "e1", source: request.source, operation: request.operation, backend: "fixture", retrievedAt: "2026-09-18T00:00:00Z", sourceUrl: "https://listings.example.test/search", verification: "source-verified" }],
      warnings: [],
      recoveryActions: [],
    });
    try {
      const output = capture();
      const exitCode = await runCli(["property-discover", "--input-file", briefFile, "--discovery-file", discoveryFile, "--output-file", outputFile], { researchExecutor: execute, ...output.io });
      expect(exitCode).toBe(0);
      expect(JSON.parse(await readFile(outputFile, "utf8"))).toEqual(expect.objectContaining({ candidates: [expect.objectContaining({ candidateId: "fixture-listings:lead-1", community: "测试项目", city: "示例城市" })] }));
      expect(output.stderr).toEqual([]);
      const researchOutput = capture();
      const researchExit = await runCli(["research-property", "--input-file", briefFile, "--candidates-file", outputFile, "--format", "md"], { ...researchOutput.io });
      expect(researchExit).toBe(1);
      expect(researchOutput.stdout.join("")).toContain("测试项目");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("stores property snapshots and renders a change timeline", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-property-snapshot-cli-"));
    const store = join(directory, "snapshots");
    const first = join(directory, "first.json");
    const second = join(directory, "second.json");
    try {
      await writeFile(first, JSON.stringify({ id: "s1", capturedAt: "2026-09-18T00:00:00Z", candidateId: "candidate-1", city: "示例城市", community: "示例小区", fields: { priceCny: 100 }, sourceEvidenceIds: ["e1"] }), "utf8");
      await writeFile(second, JSON.stringify({ id: "s2", capturedAt: "2026-09-19T00:00:00Z", candidateId: "candidate-1", city: "示例城市", community: "示例小区", fields: { priceCny: 120 }, sourceEvidenceIds: ["e2"] }), "utf8");
      expect(await runCli(["property", "snapshot", "--input-file", first, "--store", store], capture().io)).toBe(0);
      expect(await runCli(["property", "snapshot", "--input-file", second, "--store", store], capture().io)).toBe(0);
      const output = capture();
      expect(await runCli(["property", "timeline", "--store", store, "--candidate-id", "candidate-1"], output.io)).toBe(0);
      expect(JSON.parse(output.stdout.join("")).changes.at(-1)).toEqual(expect.objectContaining({ field: "priceCny", before: 100, after: 120 }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("collects and compiles decision context with JSON sidecars", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-context-cli-"));
    const briefFile = join(directory, "context-brief.json");
    const corpusFile = join(directory, "corpus.json");
    const assessmentFile = join(directory, "assessment.json");
    const reportFile = join(directory, "context-report.json");
    await writeFile(briefFile, JSON.stringify({
      domain: "cars",
      query: "candidate context",
      subjects: [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }],
      investigations: [{ id: "recent", label: "Recent", category: "news", subjectIds: ["car"], window: { from: "2025-07-26T00:00:00.000Z", to: "2026-07-26T00:00:00.000Z" } }],
      sourceQueries: [{ id: "lead", investigationId: "recent", subjectIds: ["car"], source: "brave-search", operation: "search", parameters: { query: "candidate" }, sourceRole: "discovery" }],
    }), "utf8");
    try {
      const collectOutput = capture();
      const collectExit = await runCli([
        "context", "collect",
        "--input-file", briefFile,
        "--format", "md",
        "--corpus-file", corpusFile,
      ], {
        registry: registry(),
        researchExecutor: contextExecutor,
        now: () => new Date("2026-07-26T00:00:00.000Z"),
        ...collectOutput.io,
      });
      expect(collectExit).toBe(0);
      expect(collectOutput.stdout.join("")).toContain("# Decision Evidence Corpus");
      const corpus = JSON.parse(await readFile(corpusFile, "utf8")) as {
        documents: Array<{ id: string; evidenceIds: string[] }>;
      };
      await writeFile(assessmentFile, JSON.stringify({
        events: [{
          id: "lead-event",
          title: "Alleged event",
          category: "news",
          summary: "A discovery lead requires verification",
          subjectIds: ["car"],
          documentIds: [corpus.documents[0]!.id],
          evidenceIds: corpus.documents[0]!.evidenceIds,
          verification: "unverified",
          applicability: "unknown",
          applicabilityBasis: "discovery lead only",
          severity: "unknown",
          remediation: "unknown",
        }],
        ownerSignals: [],
        conflicts: [],
        unknowns: [],
      }), "utf8");

      const compileOutput = capture();
      const compileExit = await runCli([
        "context", "compile",
        "--corpus-file", corpusFile,
        "--assessment-file", assessmentFile,
        "--format", "md",
        "--report-file", reportFile,
      ], { registry: registry(), now: () => new Date("2026-07-26T00:00:00.000Z"), ...compileOutput.io });
      expect(compileExit).toBe(1);
      expect(compileOutput.stdout.join("")).toContain("context-only");
      expect(JSON.parse(await readFile(reportFile, "utf8"))).toEqual(expect.objectContaining({
        events: [expect.objectContaining({ decisionFlag: "context-only" })],
      }));
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
