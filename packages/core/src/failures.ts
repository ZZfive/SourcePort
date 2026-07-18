import {
  SOURCE_FAILURE_CODES,
  type RecoveryAction,
  type SourceFailure,
  type SourceFailureCode,
  type SourceFailureStage,
} from "./contracts.js";

const failureCodeSet = new Set<string>(SOURCE_FAILURE_CODES);
const retryableByDefault = new Set<SourceFailureCode>([
  "network_error",
  "timeout",
  "rate_limited",
  "backend_unavailable",
]);

export function isSourceFailureCode(value: unknown): value is SourceFailureCode {
  return typeof value === "string" && failureCodeSet.has(value);
}

export function createFailure(
  code: SourceFailureCode,
  message: string,
  stage: SourceFailureStage,
  retryable = retryableByDefault.has(code),
  backend?: string,
): SourceFailure {
  return backend === undefined
    ? { code, message, stage, retryable }
    : { code, message, stage, retryable, backend };
}

export function retryRecovery(description: string): RecoveryAction {
  return { kind: "retry", description, requiresUser: false };
}

export function switchBackendRecovery(backend: string, description: string): RecoveryAction {
  return {
    kind: "switch_backend",
    description,
    requiresUser: false,
    backend,
  };
}

export function humanVerificationRecovery(
  description: string,
  resumeToken?: string,
): RecoveryAction {
  return resumeToken === undefined
    ? {
        kind: "complete_human_verification",
        description,
        requiresUser: true,
      }
    : {
        kind: "complete_human_verification",
        description,
        requiresUser: true,
        resumeToken,
      };
}

export function loginRecovery(description: string, backend?: string): RecoveryAction {
  return backend === undefined
    ? { kind: "login", description, requiresUser: true }
    : { kind: "login", description, requiresUser: true, backend };
}
