import { describe, expect, it } from "vitest";

import type { SourceWarning } from "./contracts.js";
import {
  createEvidenceRecord,
  validateEvidenceRecord,
  validateWarningEvidenceReferences,
} from "./evidence.js";

describe("evidence", () => {
  it("creates deterministic IDs independent of object key order", () => {
    const left = createEvidenceRecord({
      source: "fake",
      operation: "detail",
      backend: "fixture",
      retrievedAt: new Date("2026-07-18T00:00:00Z"),
      sourceUrl: "https://example.com/1",
      fragment: { name: "item", price: 10 },
      verification: "source-verified",
    });
    const right = createEvidenceRecord({
      source: "fake",
      operation: "detail",
      backend: "fixture",
      retrievedAt: "2026-07-18T00:00:00.000Z",
      sourceUrl: "https://example.com/1",
      fragment: { price: 10, name: "item" },
      verification: "source-verified",
    });

    expect(left.id).toBe(right.id);
    expect(left.id).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("normalizes retrieval timestamps to ISO 8601 UTC", () => {
    const record = createEvidenceRecord({
      source: "fake",
      operation: "detail",
      backend: "fixture",
      retrievedAt: "2026-07-18T08:00:00+08:00",
      verification: "claimed",
    });

    expect(record.retrievedAt).toBe("2026-07-18T00:00:00.000Z");
  });

  it("validates required provenance and timestamps", () => {
    const valid = createEvidenceRecord({
      source: "fake",
      operation: "detail",
      backend: "fixture",
      retrievedAt: "2026-07-18T00:00:00Z",
      verification: "claimed",
    });

    expect(validateEvidenceRecord(valid)).toEqual([]);
    expect(
      validateEvidenceRecord({
        ...valid,
        source: "",
        retrievedAt: "not-a-date",
      }),
    ).toEqual([
      { path: "source", message: "evidence source is required" },
      { path: "retrievedAt", message: "evidence retrieval time must be a valid ISO timestamp" },
    ]);
  });

  it("detects warnings that reference missing evidence", () => {
    const record = createEvidenceRecord({
      source: "fake",
      operation: "detail",
      backend: "fixture",
      retrievedAt: "2026-07-18T00:00:00Z",
      verification: "claimed",
    });
    const warnings: SourceWarning[] = [
      {
        code: "conflict",
        message: "source fields conflict",
        evidenceIds: [record.id, "missing"],
      },
    ];

    expect(validateWarningEvidenceReferences(warnings, [record])).toEqual([
      { path: "warnings.0.evidenceIds", message: "unknown evidence ID 'missing'" },
    ]);
  });
});
