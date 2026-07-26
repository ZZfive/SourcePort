import { describe, expect, it } from "vitest";

import {
  validateDecisionContextAssessment,
  validateDecisionContextBrief,
} from "./validate.js";

function brief() {
  return {
    domain: "cars",
    query: "candidate",
    subjects: [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }],
    investigations: [{ id: "recent", label: "Recent", category: "news", subjectIds: ["car"], window: { from: "2025-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z" } }],
    sourceQueries: [{ id: "query", investigationId: "recent", subjectIds: ["car"], source: "brave-search", operation: "search", parameters: { query: "candidate" }, sourceRole: "discovery" }],
  };
}

describe("decision context validation", () => {
  it("rejects duplicate IDs, unknown references, invalid dates, and out-of-range limits", () => {
    const input = brief();
    input.subjects.push({ ...input.subjects[0]! });
    input.investigations[0]!.window.from = "not-a-date";
    input.sourceQueries[0]!.subjectIds = ["missing"];
    const result = validateDecisionContextBrief({ ...input, limits: { totalDocuments: 81 } });
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("duplicate id");
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("unknown subject");
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("ISO date");
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain("between 1 and 80");
  });

  it("requires explicit conflicts and evidence references in every assessment item", () => {
    const result = validateDecisionContextAssessment({
      events: [],
      ownerSignals: [],
      unknowns: [{ id: "unknown", question: "Which batch?", subjectIds: ["car"] }],
    });
    expect(result.ok).toBe(false);
    expect(result.issues.some((issue) => issue.path === "conflicts")).toBe(true);
    expect(result.issues.some((issue) => issue.path.endsWith("documentIds"))).toBe(true);
    expect(result.issues.some((issue) => issue.path.endsWith("evidenceIds"))).toBe(true);
  });
});
