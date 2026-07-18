import { describe, expect, it } from "vitest";

import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest } from "../contracts.js";
import { PublicHttpBackend } from "./public-http.js";

const context = {
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
    auth: "none",
    freshnessClass: "live",
  } satisfies OperationDescriptor,
  signal: new AbortController().signal,
  attempt: 1,
};

describe("PublicHttpBackend", () => {
  it("passes response text and metadata to the source parser", async () => {
    const backend = new PublicHttpBackend({
      name: "public",
      request: () => "https://example.com/data",
      fetch: async () => new Response("payload", { status: 200 }),
      parse: async ({ body, response }) => ({ body, status: response.status }),
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ body: "payload", status: 200 });
    expect(result.backend).toBe("public");
    expect(result.evidence[0]?.sourceUrl).toBe("https://example.com/data");
  });

  it("returns a classified blocked result before parsing", async () => {
    const backend = new PublicHttpBackend({
      name: "public",
      request: () => "https://example.com/data",
      fetch: async () => new Response("login required", { status: 200 }),
      classify: ({ body }) =>
        body.includes("login")
          ? {
              status: "blocked",
              code: "auth_required",
              message: "sign in first",
              recoveryActions: [
                {
                  kind: "login",
                  description: "sign in with a browser",
                  requiresUser: true,
                },
              ],
            }
          : undefined,
      parse: () => {
        throw new Error("parser must not run for classified pages");
      },
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("blocked");
    expect(result.failure?.code).toBe("auth_required");
    expect(result.recoveryActions[0]?.kind).toBe("login");
  });
});
