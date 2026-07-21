import {
  aggregateOperationHealth,
  aggregateSourceHealth,
  backendHealthFromResult,
  createEvidenceRecord,
  type OperationDescriptor,
  type SourceAdapter,
  type SourceRequest,
  type SourceResult,
  type SourceRuntime,
  type SourceHealthRuntime,
  validateSourceRequest,
} from "@sourceport/core";

const echoOperation: OperationDescriptor = {
  source: "fake",
  operation: "echo",
  description: "Echo a value for SourcePort contract testing",
  access: "read",
  schemaVersion: "1.0.0",
  parametersSchema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: {} },
  },
  outputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["value"],
    properties: { value: {} },
  },
  backends: [{ name: "fake-memory", kind: "public-http", priority: 0 }],
  auth: "none",
  freshnessClass: "live",
};

export class FakeSourceAdapter implements SourceAdapter {
  manifest() {
    return {
      source: "fake",
      displayName: "Fake Source",
      version: "1.0.0",
      description: "Deterministic in-memory SourcePort test adapter",
    };
  }

  operations() {
    return [echoOperation];
  }

  async execute(request: SourceRequest, runtime: SourceRuntime): Promise<SourceResult> {
    const validation = validateSourceRequest(request, echoOperation.parametersSchema);
    if (!validation.ok) {
      return {
        requestId: request.requestId ?? "fake-invalid-request",
        source: request.source,
        operation: request.operation,
        operationSchemaVersion: echoOperation.schemaVersion,
        status: "failed",
        evidence: [],
        warnings: [],
        failure: validation.failure,
        recoveryActions: [],
      };
    }
    const retrievedAt = runtime.now().toISOString();
    const data = validation.value.parameters as { value: unknown };
    return {
      requestId: validation.value.requestId ?? "fake-request",
      source: "fake",
      operation: "echo",
      operationSchemaVersion: echoOperation.schemaVersion,
      status: "success",
      data,
      backend: "fake-memory",
      retrievedAt,
      freshness: { isLive: true, ageMs: 0 },
      evidence: [
        createEvidenceRecord({
          source: "fake",
          operation: "echo",
          backend: "fake-memory",
          retrievedAt,
          fragment: data,
          verification: "source-verified",
        }),
      ],
      warnings: [],
      recoveryActions: [],
    };
  }

  async health(runtime: SourceHealthRuntime) {
    const startedAt = runtime.now();
    const checkedAt = startedAt.toISOString();
    const result = await this.execute(
      {
        requestId: "fake-health",
        source: "fake",
        operation: "echo",
        parameters: { value: "health" },
      },
      runtime,
    );
    const backend = backendHealthFromResult({
      descriptor: echoOperation.backends[0]!,
      result,
      checkedAt,
      durationMs: 0,
      circuit: { state: "closed", failureCount: 0 },
    });
    const operation = aggregateOperationHealth("fake", "echo", checkedAt, [backend]);
    return aggregateSourceHealth({
      source: "fake",
      displayName: "Fake Source",
      checkedAt,
      durationMs: Math.max(0, runtime.now().getTime() - startedAt.getTime()),
      operations: [operation],
    });
  }
}
