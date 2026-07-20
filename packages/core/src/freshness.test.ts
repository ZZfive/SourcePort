import { describe, expect, it, vi } from "vitest";

import type { OperationDescriptor } from "./adapter.js";
import type { SourceRequest, SourceResult } from "./contracts.js";
import { executeWithFreshness } from "./freshness.js";
import type { CacheKeyInput, CacheReadResult, ResultCache } from "./cache/types.js";

const operation: OperationDescriptor = {
  source: "fake",
  operation: "echo",
  description: "echo",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: { type: "string" } },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: { type: "string" } },
  },
  backends: [{ name: "fixture", kind: "public-http", priority: 0 }],
  auth: "none",
  freshnessClass: "live",
};

function request(freshness?: SourceRequest["freshness"]): SourceRequest {
  return {
    requestId: "current-request",
    source: "fake",
    operation: "echo",
    parameters: { value: "x" },
    ...(freshness ? { freshness } : {}),
  };
}

function liveResult(retrievedAt = "2026-07-20T00:00:00.000Z"): SourceResult {
  return {
    requestId: "live-request",
    source: "fake",
    operation: "echo",
    operationSchemaVersion: "1.0.0",
    status: "success",
    data: { value: "live" },
    backend: "fixture",
    retrievedAt,
    freshness: { isLive: true, ageMs: 0 },
    evidence: [{
      id: "live-evidence",
      source: "fake",
      operation: "echo",
      backend: "fixture",
      retrievedAt,
      verification: "source-verified",
    }],
    warnings: [],
    recoveryActions: [],
  };
}

function blockedResult(): SourceResult {
  return {
    requestId: "live-request",
    source: "fake",
    operation: "echo",
    operationSchemaVersion: "1.0.0",
    status: "blocked",
    backend: "fixture",
    evidence: [],
    warnings: [],
    failure: {
      code: "auth_required",
      message: "login required",
      stage: "transport",
      retryable: false,
      backend: "fixture",
    },
    recoveryActions: [{
      kind: "login",
      description: "log in",
      requiresUser: true,
      backend: "fixture",
    }],
    diagnostics: {
      attempts: [{
        backend: "fixture",
        startedAt: "2026-07-20T01:00:00.000Z",
        finishedAt: "2026-07-20T01:00:01.000Z",
        status: "blocked",
        failureCode: "auth_required",
      }],
    },
  };
}

class MemoryCache implements ResultCache {
  value: CacheReadResult = { status: "miss", reason: "not_found" };
  reads = 0;
  writes = 0;

  async read(_key: CacheKeyInput): Promise<CacheReadResult> {
    this.reads += 1;
    return this.value;
  }

  async write(_key: CacheKeyInput, result: SourceResult): Promise<void> {
    this.writes += 1;
    this.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-20T00:00:00.000Z",
      result,
    };
  }
}

const now = () => new Date("2026-07-20T01:00:00.000Z");

describe("executeWithFreshness", () => {
  it("defaults to live, never reads cache, and seeds it", async () => {
    const cache = new MemoryCache();
    cache.value = { status: "hit", keyHash: "memory", storedAt: now().toISOString(), result: liveResult() };
    const executeLive = vi.fn(async () => liveResult());

    const result = await executeWithFreshness({ request: request(), operation, cache, executeLive, now });

    expect(result.status).toBe("success");
    expect(cache.reads).toBe(0);
    expect(cache.writes).toBe(1);
    expect(executeLive).toHaveBeenCalledOnce();
  });

  it("uses an eligible cache before live execution in allow-stale mode", async () => {
    const cache = new MemoryCache();
    cache.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-20T00:00:00.000Z",
      result: liveResult("2026-07-20T00:00:00.000Z"),
    };
    const executeLive = vi.fn(async () => liveResult());

    const result = await executeWithFreshness({
      request: request({ mode: "allow-stale", maxAgeMs: 3_600_000 }),
      operation,
      cache,
      executeLive,
      now,
    });

    expect(result).toEqual(expect.objectContaining({
      requestId: "current-request",
      status: "stale",
      backend: "cache",
      retrievedAt: "2026-07-20T00:00:00.000Z",
      freshness: { isLive: false, ageMs: 3_600_000 },
    }));
    expect(result.evidence[0]?.backend).toBe("fixture");
    expect(executeLive).not.toHaveBeenCalled();
  });

  it("falls back after a blocked prefer-live request without relabeling cache as live", async () => {
    const cache = new MemoryCache();
    cache.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-20T00:00:00.000Z",
      result: liveResult("2026-07-20T00:30:00.000Z"),
    };

    const result = await executeWithFreshness({
      request: request({ mode: "prefer-live", maxAgeMs: 3_600_000 }),
      operation,
      cache,
      executeLive: async () => blockedResult(),
      now,
    });

    expect(result.status).toBe("stale");
    expect(result.freshness).toEqual({ isLive: false, ageMs: 1_800_000 });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "live_retrieval_failed" }));
    expect(result.recoveryActions).toContainEqual(expect.objectContaining({ kind: "login" }));
    expect(result.diagnostics?.attempts.map((attempt) => attempt.backend)).toEqual(["fixture", "cache"]);
  });

  it("enforces maximum age and returns a recovery action when live fails", async () => {
    const cache = new MemoryCache();
    cache.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-19T00:00:00.000Z",
      result: liveResult("2026-07-19T00:00:00.000Z"),
    };

    const result = await executeWithFreshness({
      request: request({ mode: "allow-stale", maxAgeMs: 3_600_000 }),
      operation,
      cache,
      executeLive: async () => blockedResult(),
      now,
    });

    expect(result.status).toBe("blocked");
    expect(result.recoveryActions).toContainEqual(expect.objectContaining({ kind: "allow_stale_cache" }));
  });

  it("rejects corrupt cached output and executes live", async () => {
    const cache = new MemoryCache();
    cache.value = {
      status: "hit",
      keyHash: "memory",
      storedAt: "2026-07-20T00:00:00.000Z",
      result: { ...liveResult(), data: { wrong: true } },
    };

    const result = await executeWithFreshness({
      request: request({ mode: "allow-stale", maxAgeMs: 3_600_000 }),
      operation,
      cache,
      executeLive: async () => liveResult(),
      now,
    });

    expect(result.status).toBe("success");
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "cache_corrupt" }));
  });

  it.each([
    [{ mode: "live", maxAgeMs: 1 } as const, "must not include maxAgeMs"],
    [{ mode: "prefer-live" } as const, "requires maxAgeMs"],
    [{ mode: "allow-stale" } as const, "requires maxAgeMs"],
  ])("rejects invalid freshness policy %o", async (freshness, message) => {
    const executeLive = vi.fn(async () => liveResult());
    const result = await executeWithFreshness({
      request: request(freshness),
      operation,
      cache: new MemoryCache(),
      executeLive,
      now,
    });

    expect(result.status).toBe("failed");
    expect(result.failure?.message).toContain(message);
    expect(executeLive).not.toHaveBeenCalled();
  });

  it("rejects a mismatched operation schema version before live execution", async () => {
    const executeLive = vi.fn(async () => liveResult());
    const result = await executeWithFreshness({
      request: { ...request(), operationSchemaVersion: "2.0.0" },
      operation,
      cache: new MemoryCache(),
      executeLive,
      now,
    });

    expect(result.status).toBe("failed");
    expect(result.failure?.message).toContain("does not match");
    expect(executeLive).not.toHaveBeenCalled();
  });
});
