import type { SourceRequest, SourceResult } from "@sourceport/core";
import { describe, expect, it } from "vitest";

import { collectDecisionContext } from "./collect.js";

function result(request: SourceRequest, data: unknown, status: SourceResult["status"] = "success"): SourceResult {
  return {
    requestId: request.requestId ?? "request",
    source: request.source,
    operation: request.operation,
    operationSchemaVersion: "1.0.0",
    status,
    ...(data === undefined ? {} : { data }),
    backend: "fixture",
    retrievedAt: "2026-07-26T00:00:00.000Z",
    evidence: data === undefined ? [] : [{
      id: `${request.source}:${request.operation}`,
      source: request.source,
      operation: request.operation,
      backend: "fixture",
      retrievedAt: "2026-07-26T00:00:00.000Z",
      verification: "source-verified",
    }],
    warnings: [],
    recoveryActions: [],
  };
}

describe("collectDecisionContext", () => {
  it("deduplicates discovery and detail while preserving a partial optional source failure", async () => {
    const corpus = await collectDecisionContext({
      domain: "cars",
      query: "candidate context",
      subjects: [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }],
      investigations: [{ id: "risk", label: "Risk", category: "risk", subjectIds: ["car"], window: { from: "2025-01-01T00:00:00.000Z" } }],
      sourceQueries: [
        { id: "news", investigationId: "risk", subjectIds: ["car"], source: "36kr", operation: "search-articles", parameters: { query: "candidate" }, sourceRole: "media-secondary" },
        { id: "social", investigationId: "risk", subjectIds: ["car"], source: "xiaohongshu", operation: "search-notes", parameters: { query: "candidate" }, sourceRole: "community" },
      ],
    }, {
      now: () => new Date("2026-07-26T00:00:00.000Z"),
      execute: async (request) => {
        if (request.source === "36kr" && request.operation === "search-articles") return result(request, { query: "candidate", items: [{ rank: 1, title: "Event", url: "https://36kr.com/p/1" }] });
        if (request.source === "36kr" && request.operation === "get-article") return result(request, { articleId: "1", title: "Event", author: "A", body: "Detailed article body", url: "https://36kr.com/p/1" });
        return {
          ...result(request, undefined, "blocked"),
          failure: { code: "auth_required", message: "login", stage: "transport", retryable: false },
        };
      },
    });

    expect(corpus.status).toBe("partial");
    expect(corpus.documents).toHaveLength(1);
    expect(corpus.documents[0]?.stage).toBe("detail");
    expect(corpus.documents[0]?.sourceRole).toBe("media-secondary");
    expect(corpus.coverage.blockedQueries).toBe(1);
  });

  it("deduplicates equivalent content across different URLs without semantic merging", async () => {
    const corpus = await collectDecisionContext({
      domain: "cars",
      query: "candidate context",
      subjects: [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }],
      investigations: [{ id: "risk", label: "Risk", category: "risk", subjectIds: ["car"], window: { from: "2025-01-01T00:00:00.000Z" } }],
      sourceQueries: [{ id: "news", investigationId: "risk", subjectIds: ["car"], source: "brave-search", operation: "search", parameters: { query: "candidate" }, sourceRole: "discovery" }],
    }, {
      now: () => new Date("2026-07-26T00:00:00.000Z"),
      execute: async (request) => result(request, { query: "candidate", items: [
        { rank: 1, title: "Lead one", url: "https://example.com/one", snippet: "same discovery content" },
        { rank: 2, title: "Lead two", url: "https://example.com/two", snippet: "same discovery content" },
      ] }),
    });
    expect(corpus.documents).toHaveLength(1);
    expect(corpus.coverage.limitations).toContain("some documents have unknown publication dates");
  });

  it("honors the Xiaohongshu note limit and keeps top-level comments as distinct documents", async () => {
    const calls: string[] = [];
    const corpus = await collectDecisionContext({
      domain: "cars",
      query: "owner experience",
      subjects: [{ id: "car", label: "Candidate", kind: "car-series", evidenceIds: [] }],
      investigations: [{ id: "owner", label: "Owner", category: "owner", subjectIds: ["car"], window: { from: "2025-01-01T00:00:00.000Z" } }],
      sourceQueries: [{ id: "social", investigationId: "owner", subjectIds: ["car"], source: "xiaohongshu", operation: "search-notes", parameters: { query: "candidate", limit: 2 }, sourceRole: "community" }],
    }, {
      now: () => new Date("2026-07-26T00:00:00.000Z"),
      execute: async (request) => {
        calls.push(`${request.operation}:${JSON.stringify(request.parameters)}`);
        if (request.operation === "search-notes") return result(request, { items: [1, 2, 3].map((rank) => ({ rank, noteId: `note-${rank}`, title: `Note ${rank}`, author: `Author ${rank}`, url: `https://xiaohongshu.example/note-${rank}` })) });
        if (request.operation === "get-note") {
          const note = String((request.parameters as { note: string }).note);
          return result(request, { noteId: note.split("-").at(-1), title: note, author: "Owner", content: `detail ${note}`, url: note });
        }
        const note = String((request.parameters as { note: string }).note);
        return result(request, { noteId: note, url: note, items: [
          { rank: 1, author: "A", text: `comment one ${note}` },
          { rank: 2, author: "B", text: `comment two ${note}` },
        ] });
      },
    });
    expect(calls.filter((call) => call.startsWith("get-note"))).toHaveLength(2);
    expect(corpus.documents.filter((document) => document.stage === "comment")).toHaveLength(4);
  });
});
