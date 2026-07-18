import type { SourceResult, ValidationIssue, ValidationResult } from "./contracts.js";

export function validateSourceResult<T>(result: SourceResult<T>): ValidationResult<SourceResult<T>> {
  const issues: ValidationIssue[] = [];

  if (result.status === "success") {
    if (result.data === undefined) {
      issues.push({ path: "data", message: "success results require data" });
    }
    if (!result.backend) {
      issues.push({ path: "backend", message: "success results require a backend" });
    }
    if (!result.retrievedAt) {
      issues.push({ path: "retrievedAt", message: "success results require a retrieval time" });
    }
    if (result.evidence.length === 0) {
      issues.push({ path: "evidence", message: "success results require evidence" });
    }
  }

  if ((result.status === "blocked" || result.status === "failed") && !result.failure) {
    issues.push({
      path: "failure",
      message: `${result.status} results require a failure`,
    });
  }

  if (result.status === "stale" && result.freshness?.isLive !== false) {
    issues.push({
      path: "freshness.isLive",
      message: "stale results must set freshness.isLive to false",
    });
  }

  const evidenceIds = result.evidence.map((record) => record.id);
  if (new Set(evidenceIds).size !== evidenceIds.length) {
    issues.push({ path: "evidence", message: "evidence IDs must be unique" });
  }

  return issues.length === 0 ? { ok: true, value: result } : { ok: false, issues };
}
