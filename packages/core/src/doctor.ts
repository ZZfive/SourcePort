import { randomUUID } from "node:crypto";

import type { BackendDescriptor, OperationDescriptor } from "./adapter.js";
import type { BackendRouter } from "./backends/router.js";
import type { CircuitSnapshot } from "./circuit.js";
import type { SourceResult } from "./contracts.js";
import { createFailure } from "./failures.js";
import {
  aggregateDoctorReport,
  aggregateOperationHealth,
  aggregateSourceHealth,
  backendHealthFromResult,
  manualBackendHealth,
  skippedBackendHealth,
  type BackendHealth,
  type DoctorReport,
  type OperationHealth,
  type SourceHealth,
  type SourceHealthRuntime,
} from "./health.js";
import { SourceRegistry } from "./registry.js";
import { validateSourceRequest } from "./validate.js";

export interface ProbeOperationHealthOptions {
  operation: Readonly<OperationDescriptor>;
  router: BackendRouter;
  parameters: unknown;
  runtime: SourceHealthRuntime;
  overrideBackend?(descriptor: BackendDescriptor, circuit: CircuitSnapshot): BackendHealth | undefined;
}

export interface RunDoctorOptions {
  source?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  now?: () => Date;
}

function internalProbeFailure(
  operation: Readonly<OperationDescriptor>,
  backend: string,
  message: string,
): SourceResult {
  return {
    requestId: randomUUID(),
    source: operation.source,
    operation: operation.operation,
    operationSchemaVersion: operation.schemaVersion,
    status: "failed",
    backend,
    evidence: [],
    warnings: [],
    failure: createFailure("internal_error", message, "transport", false, backend),
    recoveryActions: [],
  };
}

export async function probeOperationHealth(
  options: ProbeOperationHealthOptions,
): Promise<OperationHealth> {
  const checkedAt = options.runtime.now().toISOString();
  const request = {
    requestId: randomUUID(),
    source: options.operation.source,
    operation: options.operation.operation,
    operationSchemaVersion: options.operation.schemaVersion,
    parameters: options.parameters,
    freshness: { mode: "live" as const },
    execution: { timeoutMs: options.runtime.timeoutMs, retryBudget: 0 },
  };
  const validation = validateSourceRequest(request, options.operation.parametersSchema);
  if (!validation.ok) {
    throw new Error(`health probe parameters are invalid for '${options.operation.source}.${options.operation.operation}'`);
  }

  const backends: BackendHealth[] = [];
  for (const descriptor of [...options.operation.backends].sort((left, right) => left.priority - right.priority)) {
    const circuitBefore = options.router.circuitSnapshot(options.operation, descriptor.name);
    if (descriptor.kind === "manual-step") {
      backends.push(manualBackendHealth({
        source: options.operation.source,
        operation: options.operation.operation,
        descriptor,
        checkedAt,
        circuit: circuitBefore,
      }));
      continue;
    }
    const override = options.overrideBackend?.(descriptor, circuitBefore);
    if (override) {
      backends.push(override);
      continue;
    }

    const startedAt = options.runtime.now().getTime();
    let result: SourceResult;
    try {
      result = await options.router.probe(
        validation.value,
        options.operation,
        descriptor.name,
        options.runtime.signal,
      );
    } catch (error) {
      result = internalProbeFailure(
        options.operation,
        descriptor.name,
        error instanceof Error ? error.message : "health probe failed",
      );
    }
    const finishedAt = options.runtime.now();
    backends.push(backendHealthFromResult({
      descriptor,
      result,
      checkedAt: finishedAt.toISOString(),
      durationMs: Math.max(0, finishedAt.getTime() - startedAt),
      circuit: options.router.circuitSnapshot(options.operation, descriptor.name),
    }));
  }
  return aggregateOperationHealth(
    options.operation.source,
    options.operation.operation,
    checkedAt,
    backends,
  );
}

function failedSourceHealth(
  registry: SourceRegistry,
  source: string,
  checkedAt: string,
  message: string,
): SourceHealth {
  const manifest = registry.listSources().find((candidate) => candidate.source === source);
  if (!manifest) {
    throw new Error(`source '${source}' is not registered`);
  }
  const closed: CircuitSnapshot = { state: "closed", failureCount: 0 };
  const operations = registry.listCapabilities(source).map((operation) => {
    const backends = operation.backends.map((descriptor) => descriptor.kind === "manual-step"
      ? manualBackendHealth({ source, operation: operation.operation, descriptor, checkedAt, circuit: closed })
      : skippedBackendHealth({
          source,
          operation: operation.operation,
          descriptor,
          checkedAt,
          state: "degraded",
          issueCode: "internal_error",
          message,
          circuit: closed,
        }));
    return aggregateOperationHealth(source, operation.operation, checkedAt, backends);
  });
  return {
    ...aggregateSourceHealth({
      source,
      displayName: manifest.displayName,
      checkedAt,
      operations,
    }),
    message,
  };
}

export async function runDoctor(
  registry: SourceRegistry,
  options: RunDoctorOptions = {},
): Promise<DoctorReport> {
  const now = options.now ?? (() => new Date());
  const timeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("doctor timeoutMs must be a positive integer");
  }
  const startedAt = now();
  const checkedAt = startedAt.toISOString();
  const manifests = options.source
    ? [registry.listSources().find((candidate) => candidate.source === options.source)]
    : registry.listSources();
  if (manifests.some((manifest) => manifest === undefined)) {
    registry.listCapabilities(options.source ?? "");
  }
  const selected = manifests.filter((manifest): manifest is NonNullable<typeof manifest> => manifest !== undefined);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal;
  const runtime: SourceHealthRuntime = {
    signal,
    timeoutMs,
    now,
  };
  const sources = await Promise.all(selected.map(async (manifest) => {
    try {
      return await registry.health(manifest.source, runtime);
    } catch (error) {
      return failedSourceHealth(
        registry,
        manifest.source,
        now().toISOString(),
        error instanceof Error ? error.message : "source health diagnosis failed",
      );
    }
  }));
  return aggregateDoctorReport(
    checkedAt,
    sources,
    Math.max(0, now().getTime() - startedAt.getTime()),
  );
}
