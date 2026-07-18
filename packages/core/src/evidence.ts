import { createHash } from "node:crypto";

import type {
  EvidenceRecord,
  SourceWarning,
  ValidationIssue,
} from "./contracts.js";

export type EvidenceInput = Omit<EvidenceRecord, "id" | "retrievedAt"> & {
  retrievedAt: Date | string;
};

function normalizeTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError("invalid evidence retrieval time");
  }
  return date.toISOString();
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("evidence contains a non-finite number");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("evidence contains a non-plain object");
    }
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  throw new TypeError(`evidence contains unsupported value type '${typeof value}'`);
}

function evidenceId(record: Omit<EvidenceRecord, "id">): string {
  const canonical = JSON.stringify(canonicalize(record));
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

export function createEvidenceRecord(input: EvidenceInput): EvidenceRecord {
  const record: Omit<EvidenceRecord, "id"> = {
    ...input,
    retrievedAt: normalizeTimestamp(input.retrievedAt),
  };
  return { id: evidenceId(record), ...record };
}

export function validateEvidenceRecord(record: EvidenceRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record.source) {
    issues.push({ path: "source", message: "evidence source is required" });
  }
  if (!record.operation) {
    issues.push({ path: "operation", message: "evidence operation is required" });
  }
  if (!record.backend) {
    issues.push({ path: "backend", message: "evidence backend is required" });
  }
  const date = new Date(record.retrievedAt);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== record.retrievedAt) {
    issues.push({
      path: "retrievedAt",
      message: "evidence retrieval time must be a valid ISO timestamp",
    });
  }
  return issues;
}

export function validateWarningEvidenceReferences(
  warnings: readonly SourceWarning[],
  evidence: readonly EvidenceRecord[],
): ValidationIssue[] {
  const evidenceIds = new Set(evidence.map((record) => record.id));
  const issues: ValidationIssue[] = [];
  warnings.forEach((warning, index) => {
    for (const evidenceId of warning.evidenceIds ?? []) {
      if (!evidenceIds.has(evidenceId)) {
        issues.push({
          path: `warnings.${index}.evidenceIds`,
          message: `unknown evidence ID '${evidenceId}'`,
        });
      }
    }
  });
  return issues;
}
