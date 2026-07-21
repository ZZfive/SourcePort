import { describe, expect, it } from "vitest";

import type { BackendDescriptor } from "./adapter.js";
import type { SourceFailureCode, SourceResult } from "./contracts.js";
import {
  aggregateDoctorReport,
  aggregateOperationHealth,
  aggregateSourceHealth,
  backendHealthFromResult,
  manualBackendHealth,
  unconfiguredBackendHealth,
} from "./health.js";

const checkedAt = "2026-07-20T00:00:00.000Z";
const closed = { state: "closed" as const, failureCount: 0 };

function descriptor(name: string, priority: number, kind: BackendDescriptor["kind"] = "public-http"): BackendDescriptor {
  return { name, priority, kind };
}

function result(status: SourceResult["status"], code?: SourceFailureCode): SourceResult {
  const successful = status === "success" || status === "partial";
  return {
    requestId: "request",
    source: "fake",
    operation: "echo",
    operationSchemaVersion: "1.0.0",
    status,
    ...(successful ? {
      data: { value: "x" },
      backend: "backend",
      retrievedAt: checkedAt,
      freshness: { isLive: true, ageMs: 0 },
      evidence: [{
        id: "evidence",
        source: "fake",
        operation: "echo",
        backend: "backend",
        retrievedAt: checkedAt,
        verification: "source-verified" as const,
      }],
    } : {
      backend: "backend",
      evidence: [],
      failure: {
        code: code ?? "network_error",
        message: "failed",
        stage: "transport" as const,
        retryable: false,
      },
    }),
    warnings: [],
    recoveryActions: [],
  };
}

describe("health classification", () => {
  it("maps success, partial, blocked, and drifted results", () => {
    const backend = descriptor("backend", 0);
    expect(backendHealthFromResult({ descriptor: backend, result: result("success"), checkedAt, durationMs: 1, circuit: closed })).toEqual(
      expect.objectContaining({ state: "healthy", available: true }),
    );
    expect(backendHealthFromResult({ descriptor: backend, result: result("partial"), checkedAt, durationMs: 1, circuit: closed })).toEqual(
      expect.objectContaining({ state: "degraded", available: true }),
    );
    expect(backendHealthFromResult({
      descriptor: backend,
      result: result("blocked", "access_blocked"),
      checkedAt,
      durationMs: 1,
      circuit: closed,
    })).toEqual(expect.objectContaining({ state: "blocked", available: false }));
    expect(backendHealthFromResult({
      descriptor: backend,
      result: result("failed", "unexpected_source_shape"),
      checkedAt,
      durationMs: 1,
      circuit: closed,
    })).toEqual(expect.objectContaining({ state: "drifted", available: false }));
  });

  it("marks an operation degraded when only a fallback is available", () => {
    const primaryDescriptor = descriptor("primary", 0);
    const fallbackDescriptor = descriptor("fallback", 1, "browser-session");
    const primary = backendHealthFromResult({
      descriptor: primaryDescriptor,
      result: result("blocked", "access_blocked"),
      checkedAt,
      durationMs: 1,
      circuit: closed,
    });
    const fallback = backendHealthFromResult({
      descriptor: fallbackDescriptor,
      result: { ...result("success"), backend: "fallback" },
      checkedAt,
      durationMs: 2,
      circuit: closed,
    });

    expect(aggregateOperationHealth("fake", "echo", checkedAt, [primary, fallback])).toEqual(
      expect.objectContaining({ state: "degraded", available: true }),
    );
  });

  it("reports manual backends without counting them as acquisition availability", () => {
    const blocked = backendHealthFromResult({
      descriptor: descriptor("browser", 0, "browser-session"),
      result: result("blocked", "human_verification_required"),
      checkedAt,
      durationMs: 1,
      circuit: closed,
    });
    const manual = manualBackendHealth({
      source: "fake",
      operation: "echo",
      descriptor: descriptor("manual", 1, "manual-step"),
      checkedAt,
      circuit: closed,
    });

    const operation = aggregateOperationHealth("fake", "echo", checkedAt, [blocked, manual]);
    expect(operation).toEqual(expect.objectContaining({ state: "blocked", available: false }));
    expect(manual).toEqual(expect.objectContaining({ role: "recovery", probe: "not_applicable" }));
  });

  it("aggregates unconfigured and drifted source states deterministically", () => {
    const unconfiguredBackend = unconfiguredBackendHealth({
      source: "fake",
      operation: "one",
      descriptor: descriptor("browser", 0, "browser-session"),
      checkedAt,
      issue: { issueCode: "dependency_unavailable", message: "extension disconnected" },
      circuit: closed,
    });
    const unconfiguredOperation = aggregateOperationHealth("fake", "one", checkedAt, [unconfiguredBackend]);
    const driftedBackend = backendHealthFromResult({
      descriptor: descriptor("public", 0),
      result: { ...result("failed", "source_drift"), operation: "two" },
      checkedAt,
      durationMs: 1,
      circuit: closed,
    });
    const driftedOperation = aggregateOperationHealth("fake", "two", checkedAt, [driftedBackend]);
    const source = aggregateSourceHealth({
      source: "fake",
      displayName: "Fake",
      checkedAt,
      operations: [unconfiguredOperation, driftedOperation],
    });

    expect(source.state).toBe("drifted");
    expect(aggregateDoctorReport(checkedAt, [source]).state).toBe("drifted");
  });
});
