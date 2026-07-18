import { randomUUID } from "node:crypto";

import type { OperationDescriptor } from "../adapter.js";
import { CircuitBreaker } from "../circuit.js";
import type {
  BackendAttempt,
  SourceFailureCode,
  SourceRequest,
  SourceResult,
} from "../contracts.js";
import { createFailure, retryRecovery } from "../failures.js";
import { validateSourceResult } from "../invariants.js";
import type { Backend } from "./types.js";

export interface BackendRouterOptions {
  circuit?: CircuitBreaker;
  now?: () => Date;
}

function circuitKey(operation: OperationDescriptor, backend: string): string {
  return `${operation.source}.${operation.operation}.${backend}`;
}

function orderedBackendNames(request: SourceRequest, operation: OperationDescriptor): string[] {
  const declared = [...operation.backends]
    .sort((left, right) => left.priority - right.priority)
    .map((descriptor) => descriptor.name);
  const declaredSet = new Set(declared);
  const preferred = (request.preferredBackends ?? []).filter((name) => declaredSet.has(name));
  return [...new Set([...preferred, ...declared])];
}

function syntheticFailure(
  request: SourceRequest,
  operation: OperationDescriptor,
  code: SourceFailureCode,
  message: string,
  backend?: string,
): SourceResult {
  const result: SourceResult = {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: operation.schemaVersion,
    status: "failed",
    evidence: [],
    warnings: [],
    failure: createFailure(code, message, code === "backend_unavailable" ? "selection" : "transport", undefined, backend),
    recoveryActions: code === "timeout" ? [retryRecovery("retry within a new execution budget")] : [],
  };
  if (backend !== undefined) {
    result.backend = backend;
  }
  return result;
}

async function executeWithTimeout(
  backend: Backend,
  request: SourceRequest,
  operation: OperationDescriptor,
  attempt: number,
  timeoutMs: number,
): Promise<SourceResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<SourceResult>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(syntheticFailure(request, operation, "timeout", `backend '${backend.name}' timed out`, backend.name));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      backend.execute({ request, operation, signal: controller.signal, attempt }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function withAttempts<T>(result: SourceResult<T>, attempts: BackendAttempt[]): SourceResult<T> {
  return {
    ...result,
    diagnostics: {
      attempts: [...(result.diagnostics?.attempts ?? []), ...attempts],
    },
  };
}

function shouldTryNext(result: SourceResult, hasNext: boolean): boolean {
  if (!hasNext || (result.status !== "failed" && result.status !== "blocked")) {
    return false;
  }
  if (result.failure?.code === "human_verification_required") {
    return true;
  }
  if (result.recoveryActions.some((action) => action.kind === "switch_backend")) {
    return true;
  }
  return result.failure?.retryable === true;
}

export class BackendRouter {
  readonly #backends = new Map<string, Backend>();
  readonly #circuit: CircuitBreaker;
  readonly #now: () => Date;

  constructor(backends: readonly Backend[], options: BackendRouterOptions = {}) {
    for (const backend of backends) {
      if (this.#backends.has(backend.name)) {
        throw new Error(`backend '${backend.name}' is duplicated`);
      }
      this.#backends.set(backend.name, backend);
    }
    this.#circuit = options.circuit ?? new CircuitBreaker();
    this.#now = options.now ?? (() => new Date());
  }

  async execute(request: SourceRequest, operation: OperationDescriptor): Promise<SourceResult> {
    const names = orderedBackendNames(request, operation);
    const available = names
      .map((name) => this.#backends.get(name))
      .filter((backend): backend is Backend => backend !== undefined)
      .filter((backend) => !this.#circuit.isOpen(circuitKey(operation, backend.name)));

    if (available.length === 0) {
      return syntheticFailure(
        request,
        operation,
        "backend_unavailable",
        `no backend is available for '${operation.source}.${operation.operation}'`,
      );
    }

    const retryBudget = request.execution?.retryBudget ?? Math.max(0, available.length - 1);
    const maxAttempts = Math.min(available.length, retryBudget + 1);
    const timeoutMs = request.execution?.timeoutMs ?? 30_000;
    const attempts: BackendAttempt[] = [];
    let lastResult: SourceResult | undefined;

    for (let index = 0; index < maxAttempts; index += 1) {
      const current = available[index];
      if (!current) {
        break;
      }
      const startedAt = this.#now().toISOString();
      let result = await executeWithTimeout(current, request, operation, index + 1, timeoutMs);
      const validation = validateSourceResult(result);
      if (!validation.ok) {
        result = syntheticFailure(
          request,
          operation,
          "internal_error",
          `backend '${current.name}' returned an invalid SourceResult`,
          current.name,
        );
      }
      const finishedAt = this.#now().toISOString();
      const attempt: BackendAttempt = {
        backend: current.name,
        startedAt,
        finishedAt,
        status: result.status,
      };
      if (result.failure) {
        attempt.failureCode = result.failure.code;
      }
      attempts.push(attempt);
      lastResult = result;

      const key = circuitKey(operation, current.name);
      if (result.status === "success" || result.status === "partial" || result.status === "stale") {
        this.#circuit.recordSuccess(key);
        return withAttempts(result, attempts);
      }
      this.#circuit.recordFailure(key);

      if (!shouldTryNext(result, index + 1 < maxAttempts)) {
        return withAttempts(result, attempts);
      }
    }

    return withAttempts(
      lastResult ??
        syntheticFailure(request, operation, "backend_unavailable", "backend execution did not start"),
      attempts,
    );
  }
}
