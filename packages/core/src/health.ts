import type { BackendDescriptor } from "./adapter.js";
import type { CircuitSnapshot } from "./circuit.js";
import type {
  RecoveryAction,
  SourceFailureCode,
  SourceResult,
} from "./contracts.js";

export const HEALTH_STATES = [
  "healthy",
  "degraded",
  "blocked",
  "drifted",
  "unconfigured",
] as const;

export type HealthState = (typeof HEALTH_STATES)[number];

export type HealthIssueCode =
  | SourceFailureCode
  | "dependency_missing"
  | "dependency_unavailable"
  | "manual_recovery";

export type HealthProbeMode = "live" | "configuration" | "not_applicable" | "skipped";

export interface SourceHealthRuntime {
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  now(): Date;
}

export interface BackendHealth {
  source: string;
  operation: string;
  backend: string;
  kind: BackendDescriptor["kind"];
  role: "acquisition" | "recovery";
  priority: number;
  state: HealthState;
  available: boolean;
  checkedAt: string;
  durationMs: number;
  probe: HealthProbeMode;
  issueCode?: HealthIssueCode;
  message?: string;
  recoveryActions: RecoveryAction[];
  circuit: CircuitSnapshot;
}

export interface OperationHealth {
  source: string;
  operation: string;
  state: HealthState;
  available: boolean;
  checkedAt: string;
  durationMs: number;
  message?: string;
  recoveryActions: RecoveryAction[];
  backends: BackendHealth[];
}

export interface SourceHealth {
  source: string;
  displayName: string;
  state: HealthState;
  available: boolean;
  checkedAt: string;
  durationMs: number;
  message?: string;
  recoveryActions: RecoveryAction[];
  operations: OperationHealth[];
}

export interface DoctorReport {
  checkedAt: string;
  durationMs: number;
  state: HealthState;
  available: boolean;
  sources: SourceHealth[];
}

export interface BackendConfigurationIssue {
  issueCode: "dependency_missing" | "dependency_unavailable";
  message: string;
}

function stateForFailure(code: SourceFailureCode | undefined): HealthState {
  if (code === "auth_required" || code === "human_verification_required" || code === "access_blocked") {
    return "blocked";
  }
  if (code === "source_drift" || code === "unexpected_source_shape" || code === "empty_source_result") {
    return "drifted";
  }
  return "degraded";
}

function uniqueRecoveryActions(groups: readonly RecoveryAction[][]): RecoveryAction[] {
  const seen = new Set<string>();
  const result: RecoveryAction[] = [];
  for (const action of groups.flat()) {
    const key = JSON.stringify(action);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(action);
    }
  }
  return result;
}

function unavailableState(items: readonly { state: HealthState }[]): HealthState {
  for (const state of ["drifted", "blocked", "unconfigured", "degraded"] as const) {
    if (items.some((item) => item.state === state)) {
      return state;
    }
  }
  return "degraded";
}

export function backendHealthFromResult(options: {
  descriptor: BackendDescriptor;
  result: SourceResult;
  checkedAt: string;
  durationMs: number;
  circuit: CircuitSnapshot;
}): BackendHealth {
  const { descriptor, result } = options;
  const available = result.status === "success" ||
    (result.status === "partial" && result.data !== undefined);
  const state = result.status === "success"
    ? "healthy"
    : result.status === "partial" || result.status === "stale"
      ? "degraded"
      : stateForFailure(result.failure?.code);
  return {
    source: result.source,
    operation: result.operation,
    backend: descriptor.name,
    kind: descriptor.kind,
    role: "acquisition",
    priority: descriptor.priority,
    state,
    available,
    checkedAt: options.checkedAt,
    durationMs: options.durationMs,
    probe: "live",
    ...(result.failure ? {
      issueCode: result.failure.code,
      message: result.failure.message,
    } : result.status === "partial" ? {
      message: "backend returned partial data",
    } : {}),
    recoveryActions: result.recoveryActions,
    circuit: options.circuit,
  };
}

export function unconfiguredBackendHealth(options: {
  source: string;
  operation: string;
  descriptor: BackendDescriptor;
  checkedAt: string;
  issue: BackendConfigurationIssue;
  durationMs?: number;
  circuit: CircuitSnapshot;
}): BackendHealth {
  return {
    source: options.source,
    operation: options.operation,
    backend: options.descriptor.name,
    kind: options.descriptor.kind,
    role: "acquisition",
    priority: options.descriptor.priority,
    state: "unconfigured",
    available: false,
    checkedAt: options.checkedAt,
    durationMs: options.durationMs ?? 0,
    probe: "configuration",
    issueCode: options.issue.issueCode,
    message: options.issue.message,
    recoveryActions: [{
      kind: "reconfigure",
      description: options.issue.message,
      requiresUser: true,
      backend: options.descriptor.name,
    }],
    circuit: options.circuit,
  };
}

export function skippedBackendHealth(options: {
  source: string;
  operation: string;
  descriptor: BackendDescriptor;
  checkedAt: string;
  state: HealthState;
  issueCode?: HealthIssueCode;
  message: string;
  recoveryActions?: RecoveryAction[];
  circuit: CircuitSnapshot;
}): BackendHealth {
  return {
    source: options.source,
    operation: options.operation,
    backend: options.descriptor.name,
    kind: options.descriptor.kind,
    role: "acquisition",
    priority: options.descriptor.priority,
    state: options.state,
    available: false,
    checkedAt: options.checkedAt,
    durationMs: 0,
    probe: "skipped",
    ...(options.issueCode ? { issueCode: options.issueCode } : {}),
    message: options.message,
    recoveryActions: options.recoveryActions ?? [],
    circuit: options.circuit,
  };
}

export function manualBackendHealth(options: {
  source: string;
  operation: string;
  descriptor: BackendDescriptor;
  checkedAt: string;
  circuit: CircuitSnapshot;
}): BackendHealth {
  return {
    source: options.source,
    operation: options.operation,
    backend: options.descriptor.name,
    kind: options.descriptor.kind,
    role: "recovery",
    priority: options.descriptor.priority,
    state: "healthy",
    available: false,
    checkedAt: options.checkedAt,
    durationMs: 0,
    probe: "not_applicable",
    issueCode: "manual_recovery",
    message: "manual recovery backend is registered and is not probed",
    recoveryActions: [],
    circuit: options.circuit,
  };
}

export function aggregateOperationHealth(
  source: string,
  operation: string,
  checkedAt: string,
  backends: readonly BackendHealth[],
): OperationHealth {
  const ordered = [...backends]
    .filter((backend) => backend.role === "acquisition")
    .sort((left, right) => left.priority - right.priority);
  const primary = ordered[0];
  const available = ordered.some((backend) => backend.available);
  const state = primary?.state === "healthy" && primary.available
    ? "healthy"
    : available
      ? "degraded"
      : unavailableState(ordered);
  return {
    source,
    operation,
    state,
    available,
    checkedAt,
    durationMs: backends
      .filter((backend) => backend.role === "acquisition")
      .reduce((total, backend) => total + backend.durationMs, 0),
    ...(state === "degraded" && available ? { message: "a fallback or partial backend remains available" } : {}),
    recoveryActions: available
      ? []
      : uniqueRecoveryActions(backends.map((backend) => backend.recoveryActions)),
    backends: [...backends].sort((left, right) => left.priority - right.priority),
  };
}

export function aggregateSourceHealth(options: {
  source: string;
  displayName: string;
  checkedAt: string;
  durationMs?: number;
  operations: readonly OperationHealth[];
}): SourceHealth {
  const available = options.operations.every((operation) => operation.available);
  const state = options.operations.every((operation) => operation.state === "healthy")
    ? "healthy"
    : available
      ? "degraded"
      : unavailableState(options.operations.filter((operation) => !operation.available));
  return {
    source: options.source,
    displayName: options.displayName,
    state,
    available,
    checkedAt: options.checkedAt,
    durationMs: options.durationMs ?? options.operations.reduce((total, operation) => total + operation.durationMs, 0),
    recoveryActions: uniqueRecoveryActions(options.operations.map((operation) => operation.recoveryActions)),
    operations: [...options.operations],
  };
}

export function aggregateDoctorReport(
  checkedAt: string,
  sources: readonly SourceHealth[],
  durationMs = sources.reduce((total, source) => total + source.durationMs, 0),
): DoctorReport {
  const available = sources.every((source) => source.available);
  const state = sources.every((source) => source.state === "healthy")
    ? "healthy"
    : available
      ? "degraded"
      : unavailableState(sources.filter((source) => !source.available));
  return { checkedAt, durationMs, state, available, sources: [...sources] };
}
