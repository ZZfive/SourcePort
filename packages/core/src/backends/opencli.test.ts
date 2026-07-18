import { describe, expect, it } from "vitest";

import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest } from "../contracts.js";
import { OpenCliBackend } from "./opencli.js";

const context = {
  request: {
    requestId: "request-1",
    source: "fake",
    operation: "echo",
    parameters: {},
  } satisfies SourceRequest,
  operation: {
    source: "fake",
    operation: "echo",
    description: "echo",
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

describe("OpenCliBackend", () => {
  it("executes without a shell and parses JSON output", async () => {
    const backend = new OpenCliBackend({
      name: "opencli",
      command: process.execPath,
      args: () => ["-e", "console.log(JSON.stringify({value:'ok'}))"],
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ value: "ok" });
    expect(result.backend).toBe("opencli");
  });

  it("classifies invalid JSON as an unexpected source shape", async () => {
    const backend = new OpenCliBackend({
      name: "opencli",
      command: process.execPath,
      args: () => ["-e", "console.log('not-json')"],
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("failed");
    expect(result.failure?.code).toBe("unexpected_source_shape");
  });
});
