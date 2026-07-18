import { describe, expect, it } from "vitest";

import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest, SourceResult } from "../contracts.js";
import { createFailure, humanVerificationRecovery } from "../failures.js";
import { CircuitBreaker } from "../circuit.js";
import type { Backend, BackendExecutionContext } from "./types.js";
import { BackendRouter } from "./router.js";

const request = (overrides: Partial<SourceRequest> = {}): SourceRequest => ({
  requestId: "request-1",
  source: "fake",
  operation: "echo",
  parameters: {},
  ...overrides,
});

const operation = (backendNames: string[]): OperationDescriptor => ({
  source: "fake",
  operation: "echo",
  description: "echo",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: { type: "object" },
  outputSchema: { type: "object" },
  backends: backendNames.map((name, priority) => ({
    name,
    kind: "public-http" as const,
    priority,
  })),
  auth: "none",
  freshnessClass: "live",
});

const success = (backend: string): SourceResult<{ backend: string }> => ({
  requestId: "request-1",
  source: "fake",
  operation: "echo",
  operationSchemaVersion: "1.0.0",
  status: "success",
  data: { backend },
  backend,
  retrievedAt: "2026-07-18T00:00:00.000Z",
  evidence: [
    {
      id: `evidence-${backend}`,
      source: "fake",
      operation: "echo",
      backend,
      retrievedAt: "2026-07-18T00:00:00.000Z",
      verification: "source-verified",
    },
  ],
  warnings: [],
  recoveryActions: [],
});

const failed = (
  backend: string,
  code: "network_error" | "invalid_request" | "human_verification_required",
): SourceResult => ({
  requestId: "request-1",
  source: "fake",
  operation: "echo",
  operationSchemaVersion: "1.0.0",
  status: code === "human_verification_required" ? "blocked" : "failed",
  backend,
  evidence: [],
  warnings: [],
  failure: createFailure(
    code,
    code,
    code === "invalid_request" ? "validation" : "transport",
  ),
  recoveryActions:
    code === "human_verification_required"
      ? [humanVerificationRecovery("verify in browser")]
      : [],
});

const backend = (
  name: string,
  execute: (context: BackendExecutionContext) => Promise<SourceResult>,
): Backend => ({
  name,
  kind: "public-http",
  execute,
});

describe("BackendRouter", () => {
  it("uses the declared backend order", async () => {
    const calls: string[] = [];
    const router = new BackendRouter([
      backend("first", async () => {
        calls.push("first");
        return success("first");
      }),
      backend("second", async () => {
        calls.push("second");
        return success("second");
      }),
    ]);

    const result = await router.execute(request(), operation(["first", "second"]));

    expect(result.status).toBe("success");
    expect(result.backend).toBe("first");
    expect(calls).toEqual(["first"]);
  });

  it("moves declared preferred backends to the front", async () => {
    const calls: string[] = [];
    const router = new BackendRouter([
      backend("first", async () => {
        calls.push("first");
        return success("first");
      }),
      backend("second", async () => {
        calls.push("second");
        return success("second");
      }),
    ]);

    const result = await router.execute(
      request({ preferredBackends: ["second", "not-declared"] }),
      operation(["first", "second"]),
    );

    expect(result.backend).toBe("second");
    expect(calls).toEqual(["second"]);
  });

  it("falls back after a bounded retryable failure", async () => {
    const router = new BackendRouter([
      backend("first", async () => failed("first", "network_error")),
      backend("second", async () => success("second")),
    ]);

    const result = await router.execute(request({ execution: { retryBudget: 1 } }), operation([
      "first",
      "second",
    ]));

    expect(result.backend).toBe("second");
    expect(result.diagnostics?.attempts.map((attempt) => attempt.backend)).toEqual([
      "first",
      "second",
    ]);
  });

  it("does not retry deterministic validation failures", async () => {
    const calls: string[] = [];
    const router = new BackendRouter([
      backend("first", async () => failed("first", "invalid_request")),
      backend("second", async () => {
        calls.push("second");
        return success("second");
      }),
    ]);

    const result = await router.execute(request({ execution: { retryBudget: 5 } }), operation([
      "first",
      "second",
    ]));

    expect(result.failure?.code).toBe("invalid_request");
    expect(calls).toEqual([]);
  });

  it("tries another declared backend after a human-verification block", async () => {
    const router = new BackendRouter([
      backend("public", async () => failed("public", "human_verification_required")),
      backend("browser", async () => success("browser")),
    ]);

    const result = await router.execute(request(), operation(["public", "browser"]));

    expect(result.backend).toBe("browser");
    expect(result.diagnostics?.attempts).toHaveLength(2);
  });

  it("returns human-verification recovery when no fallback succeeds", async () => {
    const router = new BackendRouter([
      backend("browser", async () => failed("browser", "human_verification_required")),
    ]);

    const result = await router.execute(request(), operation(["browser"]));

    expect(result.status).toBe("blocked");
    expect(result.failure?.code).toBe("human_verification_required");
    expect(result.recoveryActions[0]?.requiresUser).toBe(true);
  });

  it("turns backend timeouts into retryable timeout failures", async () => {
    const router = new BackendRouter([
      backend(
        "slow",
        async () => new Promise<SourceResult>(() => undefined),
      ),
    ]);

    const result = await router.execute(
      request({ execution: { timeoutMs: 5, retryBudget: 0 } }),
      operation(["slow"]),
    );

    expect(result.status).toBe("failed");
    expect(result.failure?.code).toBe("timeout");
    expect(result.failure?.retryable).toBe(true);
  });

  it("opens a circuit only after repeated failures", async () => {
    const circuit = new CircuitBreaker({ failureThreshold: 2 });
    let calls = 0;
    const router = new BackendRouter(
      [
        backend("broken", async () => {
          calls += 1;
          return failed("broken", "network_error");
        }),
      ],
      { circuit },
    );
    const descriptor = operation(["broken"]);

    await router.execute(request(), descriptor);
    expect(circuit.isOpen("fake.echo.broken")).toBe(false);
    await router.execute(request(), descriptor);
    expect(circuit.isOpen("fake.echo.broken")).toBe(true);
    const third = await router.execute(request(), descriptor);

    expect(calls).toBe(2);
    expect(third.failure?.code).toBe("backend_unavailable");
  });
});
