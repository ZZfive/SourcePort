import { describe, expect, it } from "vitest";

import {
  createFailure,
  humanVerificationRecovery,
  isSourceFailureCode,
  retryRecovery,
  switchBackendRecovery,
} from "./failures.js";

describe("source failures", () => {
  it("recognizes only finite failure codes", () => {
    expect(isSourceFailureCode("network_error")).toBe(true);
    expect(isSourceFailureCode("made_up")).toBe(false);
  });

  it.each([
    ["network_error", true],
    ["timeout", true],
    ["rate_limited", true],
    ["invalid_request", false],
    ["source_drift", false],
    ["human_verification_required", false],
  ] as const)("classifies %s retryability as %s", (code, retryable) => {
    expect(createFailure(code, "message", "transport").retryable).toBe(retryable);
  });

  it("allows explicit retryability when evidence overrides the default", () => {
    expect(createFailure("backend_unavailable", "missing", "selection", false).retryable).toBe(false);
  });
});

describe("recovery actions", () => {
  it("creates bounded retry recovery", () => {
    expect(retryRecovery("retry once")).toEqual({
      kind: "retry",
      description: "retry once",
      requiresUser: false,
    });
  });

  it("creates backend-switch recovery", () => {
    expect(switchBackendRecovery("browser", "use browser")).toEqual({
      kind: "switch_backend",
      description: "use browser",
      requiresUser: false,
      backend: "browser",
    });
  });

  it("creates user-controlled human verification recovery", () => {
    expect(humanVerificationRecovery("verify in browser", "resume-1")).toEqual({
      kind: "complete_human_verification",
      description: "verify in browser",
      requiresUser: true,
      resumeToken: "resume-1",
    });
  });
});
