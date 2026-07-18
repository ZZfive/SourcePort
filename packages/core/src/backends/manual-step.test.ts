import { describe, expect, it } from "vitest";

import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest } from "../contracts.js";
import { ManualStepBackend } from "./manual-step.js";

describe("ManualStepBackend", () => {
  it("returns a user-controlled verification recovery", async () => {
    const backend = new ManualStepBackend({
      name: "manual",
      description: "Log in and complete verification",
    });
    const result = await backend.execute({
      request: {
        requestId: "request-1",
        source: "fake",
        operation: "read",
        parameters: {},
      } satisfies SourceRequest,
      operation: {
        source: "fake",
        operation: "read",
        description: "read",
        access: "read",
        schemaVersion: "1.0.0",
        parametersSchema: { type: "object" },
        outputSchema: { type: "object" },
        backends: [],
        auth: "human-assisted",
        freshnessClass: "live",
      } satisfies OperationDescriptor,
      signal: new AbortController().signal,
      attempt: 1,
    });

    expect(result.status).toBe("blocked");
    expect(result.failure?.code).toBe("human_verification_required");
    expect(result.recoveryActions).toEqual([
      expect.objectContaining({
        kind: "complete_human_verification",
        requiresUser: true,
      }),
    ]);
  });
});
