import { describe, expect, it } from "vitest";

import { validateOperationOutput, validateSourceRequest } from "./validate.js";

const operationParametersSchema = {
  type: "object",
  additionalProperties: false,
  required: ["value"],
  properties: {
    value: { type: "string", minLength: 1 },
    limit: { type: "integer", minimum: 1, maximum: 10 },
  },
} as const;

describe("validateSourceRequest", () => {
  it("accepts a valid request without changing operation parameters", () => {
    const input = {
      source: "fake",
      operation: "echo",
      parameters: { value: "hello", limit: 3 },
    };

    const result = validateSourceRequest(input, operationParametersSchema);

    expect(result).toEqual({ ok: true, value: input });
  });

  it("rejects unknown top-level fields", () => {
    const result = validateSourceRequest(
      {
        source: "fake",
        operation: "echo",
        parameters: { value: "hello" },
        ignored: true,
      },
      operationParametersSchema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_request");
      expect(result.issues.some((issue) => issue.path === "ignored")).toBe(true);
    }
  });

  it.each(["source", "operation"] as const)("rejects a missing %s", (field) => {
    const input: Record<string, unknown> = {
      source: "fake",
      operation: "echo",
      parameters: { value: "hello" },
    };
    delete input[field];

    const result = validateSourceRequest(input, operationParametersSchema);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_request");
      expect(result.issues.some((issue) => issue.path === field)).toBe(true);
    }
  });

  it("reports unsupported operation parameters instead of dropping them", () => {
    const result = validateSourceRequest(
      {
        source: "fake",
        operation: "echo",
        parameters: { value: "hello", unsupported: true },
      },
      operationParametersSchema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("unsupported_parameter");
      expect(result.issues).toContainEqual({
        path: "parameters.unsupported",
        message: "unsupported operation parameter",
      });
    }
  });

  it("reports operation parameter type errors", () => {
    const result = validateSourceRequest(
      {
        source: "fake",
        operation: "echo",
        parameters: { value: "hello", limit: 99 },
      },
      operationParametersSchema,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("invalid_request");
      expect(result.issues.some((issue) => issue.path === "parameters.limit")).toBe(true);
    }
  });
});

describe("validateOperationOutput", () => {
  it("rejects output that does not match the operation schema", () => {
    const result = validateOperationOutput(
      { value: 1 },
      {
        type: "object",
        additionalProperties: false,
        required: ["value"],
        properties: { value: { type: "string" } },
      },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("data.value");
    }
  });
});
