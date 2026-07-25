import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  query: "武汉15万落地买车",
  market: { city: "武汉" },
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
    await writeFile(inputFile, JSON.stringify(researchBrief), "utf8");
    try {
      const output = capture();
      const exitCode = await runCli([
        "research-cars",
        "--input-file",
        inputFile,
        "--format",
        "md",
      ], {
        registry: registry(),
        researchExecutor: blockedResearchExecutor,
        ...output.io,
      });

      expect(exitCode).toBe(3);
      expect(output.stdout.join("")).toContain("# Car Research Report");
      expect(output.stdout.join("")).toContain("## Coverage limitations");
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
});
