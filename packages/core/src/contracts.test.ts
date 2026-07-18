import { describe, expect, it } from "vitest";

import {
  SOURCE_STATUSES,
  type EvidenceRecord,
  type SourceFailure,
  type SourceRequest,
  type SourceResult,
} from "./contracts.js";
import { validateSourceResult } from "./invariants.js";

const evidence = (id = "evidence-1"): EvidenceRecord => ({
  id,
  source: "fake",
  operation: "echo",
  backend: "fixture",
  retrievedAt: "2026-07-18T00:00:00.000Z",
  verification: "source-verified",
});

const failure = (code: SourceFailure["code"] = "access_blocked"): SourceFailure => ({
  code,
  message: "blocked",
  stage: "transport",
  retryable: false,
});

const validRequest: SourceRequest = {
  source: "fake",
  operation: "echo",
  parameters: { value: "hello" },
};

describe("SourcePort contracts", () => {
  it("exposes the complete finite status set", () => {
    expect(SOURCE_STATUSES).toEqual(["success", "partial", "stale", "blocked", "failed"]);
  });

  it("keeps request parameters as an explicit value", () => {
    expect(validRequest.parameters).toEqual({ value: "hello" });
  });
});

describe("SourceResult invariants", () => {
  it("accepts a complete success result", () => {
    const result: SourceResult<{ value: string }> = {
      requestId: "request-1",
      source: "fake",
      operation: "echo",
      operationSchemaVersion: "1.0.0",
      status: "success",
      data: { value: "hello" },
      backend: "fixture",
      retrievedAt: "2026-07-18T00:00:00.000Z",
      freshness: { isLive: true, ageMs: 0 },
      evidence: [evidence()],
      warnings: [],
      recoveryActions: [],
    };

    expect(validateSourceResult(result)).toEqual({ ok: true, value: result });
  });

  it.each(["data", "backend", "retrievedAt", "evidence"] as const)(
    "rejects a success result without %s",
    (field) => {
      const result: SourceResult<{ value: string }> = {
        requestId: "request-1",
        source: "fake",
        operation: "echo",
        operationSchemaVersion: "1.0.0",
        status: "success",
        data: { value: "hello" },
        backend: "fixture",
        retrievedAt: "2026-07-18T00:00:00.000Z",
        freshness: { isLive: true },
        evidence: [evidence()],
        warnings: [],
        recoveryActions: [],
      };

      if (field === "evidence") {
        result.evidence = [];
      } else {
        delete result[field];
      }

      const validation = validateSourceResult(result);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.issues.some((issue) => issue.path === field)).toBe(true);
      }
    },
  );

  it.each(["blocked", "failed"] as const)("requires a failure for %s results", (status) => {
    const result: SourceResult = {
      requestId: "request-1",
      source: "fake",
      operation: "echo",
      operationSchemaVersion: "1.0.0",
      status,
      evidence: [],
      warnings: [],
      recoveryActions: [],
    };

    const validation = validateSourceResult(result);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "failure",
        message: `${status} results require a failure`,
      });
    }

    result.failure = failure();
    expect(validateSourceResult(result).ok).toBe(true);
  });

  it("requires stale results to be explicitly non-live", () => {
    const result: SourceResult<{ value: string }> = {
      requestId: "request-1",
      source: "fake",
      operation: "echo",
      operationSchemaVersion: "1.0.0",
      status: "stale",
      data: { value: "cached" },
      backend: "cache",
      retrievedAt: "2026-07-17T00:00:00.000Z",
      freshness: { isLive: true, ageMs: 86_400_000 },
      evidence: [evidence()],
      warnings: [],
      recoveryActions: [],
    };

    const validation = validateSourceResult(result);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "freshness.isLive",
        message: "stale results must set freshness.isLive to false",
      });
    }
  });

  it("rejects duplicate evidence IDs", () => {
    const result: SourceResult<{ value: string }> = {
      requestId: "request-1",
      source: "fake",
      operation: "echo",
      operationSchemaVersion: "1.0.0",
      status: "success",
      data: { value: "hello" },
      backend: "fixture",
      retrievedAt: "2026-07-18T00:00:00.000Z",
      evidence: [evidence(), evidence()],
      warnings: [],
      recoveryActions: [],
    };

    const validation = validateSourceResult(result);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.issues).toContainEqual({
        path: "evidence",
        message: "evidence IDs must be unique",
      });
    }
  });
});
