import { describe, expect, it } from "vitest";

import type { OperationDescriptor } from "../adapter.js";
import type { SourceRequest } from "../contracts.js";
import { classifyOpenCliFailure, OpenCliBackend } from "./opencli.js";

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

  it("appends JSON output and normalizes parsed data", async () => {
    const backend = new OpenCliBackend({
      name: "opencli",
      command: process.execPath,
      args: () => ["-e", "console.log(JSON.stringify(process.argv.slice(1)))", "--"],
      jsonOutput: true,
      parse: (data) => ({ args: data }),
    });

    const result = await backend.execute(context);

    expect(result.status).toBe("success");
    expect(result.data).toEqual({ args: ["-f", "json"] });
  });

  it("classifies common OpenCLI error envelopes", () => {
    expect(classifyOpenCliFailure({
      exitCode: 1,
      stdout: "",
      stderr: "code: AUTH_REQUIRED\nmessage: Login required",
    }).code).toBe("auth_required");
    expect(classifyOpenCliFailure({
      exitCode: 1,
      stdout: "",
      stderr: "message: Browser connection dropped after navigate",
    }).code).toBe("backend_unavailable");
    expect(classifyOpenCliFailure({
      exitCode: 1,
      stdout: "",
      stderr: "code: NO_DATA\nmessage: No results found",
    }).code).toBe("empty_source_result");
    expect(classifyOpenCliFailure({ exitCode: 1, stdout: "", stderr: "message: 请完成安全验证 captcha" }).code)
      .toBe("human_verification_required");
    expect(classifyOpenCliFailure({ exitCode: 1, stdout: "", stderr: "message: Too many requests, rate limit" }).code)
      .toBe("rate_limited");
    expect(classifyOpenCliFailure({ exitCode: 1, stdout: "", stderr: "message: selector missing after source drift" }).code)
      .toBe("source_drift");
  });

  it("returns reconfiguration guidance when the OpenCLI process cannot start", async () => {
    const backend = new OpenCliBackend({
      name: "missing-opencli",
      command: "/definitely/missing/opencli",
      args: () => [],
    });
    const result = await backend.execute(context);
    expect(result.failure?.code).toBe("backend_unavailable");
    expect(result.recoveryActions).toEqual([expect.objectContaining({ kind: "reconfigure" })]);
  });
});
