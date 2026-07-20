import { randomUUID } from "node:crypto";

import type { OperationDescriptor } from "./adapter.js";
import type {
  BackendAttempt,
  RecoveryAction,
  SourceRequest,
  SourceResult,
  SourceWarning,
} from "./contracts.js";
import { createFailure } from "./failures.js";
import { validateSourceResult } from "./invariants.js";
import { validateOperationOutput, validateSourceRequest } from "./validate.js";
import type { CacheKeyInput, CacheReadResult, ResultCache } from "./cache/types.js";

export interface ExecuteWithFreshnessOptions {
  request: SourceRequest;
  operation: Readonly<OperationDescriptor>;
  cache: ResultCache;
  executeLive(request: SourceRequest): Promise<SourceResult>;
  now?: () => Date;
}

interface CacheLookup {
  result?: SourceResult;
  ageMs?: number;
  corruptMessage?: string;
}

function invalidResult(
  request: SourceRequest,
  operation: Readonly<OperationDescriptor>,
  message: string,
  warnings: SourceWarning[] = [],
): SourceResult {
  return {
    requestId: request.requestId ?? randomUUID(),
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: operation.schemaVersion,
    status: "failed",
    evidence: [],
    warnings,
    failure: createFailure("invalid_request", message, "validation"),
    recoveryActions: [],
  };
}

function cacheKey(request: SourceRequest, operation: Readonly<OperationDescriptor>): CacheKeyInput {
  return {
    source: request.source,
    operation: request.operation,
    parameters: request.parameters,
    operationSchemaVersion: operation.schemaVersion,
  };
}

function cacheCorruptWarning(message: string): SourceWarning {
  return { code: "cache_corrupt", message };
}

function appendWarnings(result: SourceResult, warnings: readonly SourceWarning[]): SourceResult {
  return warnings.length === 0 ? result : { ...result, warnings: [...result.warnings, ...warnings] };
}

function addRecovery(result: SourceResult, action: RecoveryAction): SourceResult {
  if (result.recoveryActions.some((candidate) => candidate.kind === action.kind)) {
    return result;
  }
  return { ...result, recoveryActions: [...result.recoveryActions, action] };
}

function staleRecovery(ageMs: number, maxAgeMs: number): RecoveryAction {
  return {
    kind: "allow_stale_cache",
    description: `A cached result exists but is ${ageMs}ms old, exceeding maxAgeMs=${maxAgeMs}`,
    requiresUser: false,
  };
}

function liveFailureWarning(result: SourceResult): SourceWarning | undefined {
  if (!result.failure) {
    return undefined;
  }
  return {
    code: "live_retrieval_failed",
    message: `${result.failure.code}: ${result.failure.message}`,
  };
}

function validateCachedResult(
  read: CacheReadResult,
  key: CacheKeyInput,
  operation: Readonly<OperationDescriptor>,
  now: Date,
): CacheLookup {
  if (read.status === "miss") {
    return read.reason === "corrupt" ? { corruptMessage: read.message ?? "cache entry is corrupt" } : {};
  }
  const result = read.result;
  if (
    (result.status !== "success" && result.status !== "partial") ||
    result.source !== key.source ||
    result.operation !== key.operation ||
    result.operationSchemaVersion !== key.operationSchemaVersion ||
    result.data === undefined ||
    result.retrievedAt === undefined ||
    result.evidence.length === 0 ||
    result.freshness?.isLive !== true ||
    !validateSourceResult(result).ok ||
    !validateOperationOutput(result.data, operation.outputSchema).ok
  ) {
    return { corruptMessage: "cached result failed the current result or output contract" };
  }
  const retrievedAt = Date.parse(result.retrievedAt);
  const ageMs = now.getTime() - retrievedAt;
  if (!Number.isFinite(retrievedAt) || ageMs < 0) {
    return { corruptMessage: "cached result has an invalid or future retrieval time" };
  }
  return { result, ageMs };
}

async function readCache(
  cache: ResultCache,
  key: CacheKeyInput,
  operation: Readonly<OperationDescriptor>,
  now: Date,
): Promise<CacheLookup> {
  try {
    return validateCachedResult(await cache.read(key), key, operation, now);
  } catch (error) {
    return { corruptMessage: error instanceof Error ? error.message : "cache read failed" };
  }
}

function cacheAttempt(now: Date): BackendAttempt {
  const timestamp = now.toISOString();
  return {
    backend: "cache",
    startedAt: timestamp,
    finishedAt: timestamp,
    status: "stale",
  };
}

function fromCache(
  cached: SourceResult,
  request: SourceRequest,
  ageMs: number,
  now: Date,
  liveResult?: SourceResult,
): SourceResult {
  const warning = liveResult ? liveFailureWarning(liveResult) : undefined;
  const { failure: _failure, diagnostics: _diagnostics, ...base } = cached;
  return {
    ...base,
    requestId: request.requestId ?? randomUUID(),
    status: "stale",
    backend: "cache",
    freshness: { isLive: false, ageMs },
    warnings: [...cached.warnings, ...(warning ? [warning] : [])],
    recoveryActions: [
      ...cached.recoveryActions,
      ...(liveResult?.recoveryActions ?? []),
    ],
    diagnostics: {
      attempts: [
        ...(liveResult?.diagnostics?.attempts ?? []),
        cacheAttempt(now),
      ],
    },
  };
}

async function writeLiveResult(
  cache: ResultCache,
  key: CacheKeyInput,
  result: SourceResult,
): Promise<SourceResult> {
  if (
    (result.status !== "success" && result.status !== "partial") ||
    result.data === undefined ||
    result.retrievedAt === undefined ||
    result.evidence.length === 0 ||
    result.freshness?.isLive !== true ||
    !validateSourceResult(result).ok
  ) {
    return result;
  }
  try {
    await cache.write(key, result);
    return result;
  } catch (error) {
    return appendWarnings(result, [{
      code: "cache_write_failed",
      message: error instanceof Error ? error.message : "cache write failed",
    }]);
  }
}

function validateFreshness(
  request: SourceRequest,
  operation: Readonly<OperationDescriptor>,
): SourceResult | undefined {
  if (request.source !== operation.source || request.operation !== operation.operation) {
    return invalidResult(request, operation, "request source and operation must match the operation descriptor");
  }
  if (
    request.operationSchemaVersion !== undefined &&
    request.operationSchemaVersion !== operation.schemaVersion
  ) {
    return invalidResult(
      request,
      operation,
      `requested operation schema version '${request.operationSchemaVersion}' does not match '${operation.schemaVersion}'`,
    );
  }
  const freshness = request.freshness;
  if (!freshness) {
    return undefined;
  }
  if (freshness.mode === "live" && freshness.maxAgeMs !== undefined) {
    return invalidResult(request, operation, "live freshness mode must not include maxAgeMs");
  }
  if (freshness.mode !== "live" && freshness.maxAgeMs === undefined) {
    return invalidResult(request, operation, `${freshness.mode} freshness mode requires maxAgeMs`);
  }
  return undefined;
}

export async function executeWithFreshness(
  options: ExecuteWithFreshnessOptions,
): Promise<SourceResult> {
  const requestId = options.request.requestId ?? randomUUID();
  const request: SourceRequest = {
    ...options.request,
    requestId,
    operationSchemaVersion: options.operation.schemaVersion,
  };
  const envelope = validateSourceRequest(request, options.operation.parametersSchema);
  if (!envelope.ok) {
    return invalidResult(
      request,
      options.operation,
      envelope.failure.message,
      envelope.issues.map((issue) => ({
        code: "validation_issue",
        message: issue.message,
        field: issue.path,
      })),
    );
  }
  const freshnessFailure = validateFreshness(options.request, options.operation);
  if (freshnessFailure) {
    return { ...freshnessFailure, requestId };
  }

  const now = options.now ?? (() => new Date());
  const key = cacheKey(request, options.operation);
  const mode = request.freshness?.mode ?? "live";
  const maxAgeMs = request.freshness?.maxAgeMs;

  if (mode === "allow-stale" && maxAgeMs !== undefined) {
    const checkedAt = now();
    const cached = await readCache(options.cache, key, options.operation, checkedAt);
    if (cached.result && cached.ageMs !== undefined && cached.ageMs <= maxAgeMs) {
      return fromCache(cached.result, request, cached.ageMs, checkedAt);
    }
    let live = await options.executeLive(request);
    if (cached.corruptMessage) {
      live = appendWarnings(live, [cacheCorruptWarning(cached.corruptMessage)]);
    }
    if (cached.result && cached.ageMs !== undefined && cached.ageMs > maxAgeMs &&
        (live.status === "blocked" || live.status === "failed")) {
      live = addRecovery(live, staleRecovery(cached.ageMs, maxAgeMs));
    }
    return writeLiveResult(options.cache, key, live);
  }

  let live = await options.executeLive(request);
  if (mode === "prefer-live" && maxAgeMs !== undefined &&
      (live.status === "blocked" || live.status === "failed")) {
    const checkedAt = now();
    const cached = await readCache(options.cache, key, options.operation, checkedAt);
    if (cached.result && cached.ageMs !== undefined && cached.ageMs <= maxAgeMs) {
      return fromCache(cached.result, request, cached.ageMs, checkedAt, live);
    }
    if (cached.corruptMessage) {
      live = appendWarnings(live, [cacheCorruptWarning(cached.corruptMessage)]);
    }
    if (cached.result && cached.ageMs !== undefined && cached.ageMs > maxAgeMs) {
      live = addRecovery(live, staleRecovery(cached.ageMs, maxAgeMs));
    }
  }
  return writeLiveResult(options.cache, key, live);
}
