import { describe, expect, it } from "vitest";

import { redactSensitive, sanitizeArtifact } from "./redaction.js";

describe("redactSensitive", () => {
  it("recursively redacts known credential and private account keys", () => {
    const result = redactSensitive({
      headers: {
        Authorization: "Bearer secret",
        Accept: "application/json",
        "Set-Cookie": "session=secret",
      },
      session: {
        cookie: "a=b",
        csrfToken: "csrf-secret",
        accountId: "private-account",
      },
      data: { title: "public" },
    });

    expect(result.value).toEqual({
      headers: {
        Authorization: "[REDACTED]",
        Accept: "application/json",
        "Set-Cookie": "[REDACTED]",
      },
      session: {
        cookie: "[REDACTED]",
        csrfToken: "[REDACTED]",
        accountId: "[REDACTED]",
      },
      data: { title: "public" },
    });
    expect(result.redactedPaths).toEqual([
      "headers.Authorization",
      "headers.Set-Cookie",
      "session.cookie",
      "session.csrfToken",
      "session.accountId",
    ]);
  });

  it("does not mutate the input", () => {
    const input = { token: "secret", nested: { value: 1 } };

    redactSensitive(input);

    expect(input).toEqual({ token: "secret", nested: { value: 1 } });
  });
});

describe("sanitizeArtifact", () => {
  it("returns a JSON-safe sanitized artifact", () => {
    const result = sanitizeArtifact({ token: "secret", value: 1 });

    expect(result).toEqual({
      ok: true,
      value: { token: "[REDACTED]", value: 1 },
      redactedPaths: ["token"],
    });
  });

  it("rejects cyclic data rather than storing a partial artifact", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;

    const result = sanitizeArtifact(cyclic);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure.code).toBe("evidence_requirement_unmet");
      expect(result.failure.stage).toBe("evidence");
    }
  });
});
