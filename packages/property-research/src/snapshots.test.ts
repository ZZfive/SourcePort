import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clusterPropertyFeedback, createFilePropertySnapshotStore, diffPropertySnapshots, type PropertySnapshot } from "./snapshots.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); });

function snapshot(fields: Record<string, unknown>, capturedAt = "2026-09-18T00:00:00.000Z"): PropertySnapshot {
  return { id: `snapshot-${capturedAt}`, capturedAt, candidateId: "candidate-1", city: "示例城市", community: "示例小区", fields, sourceEvidenceIds: ["evidence-1"] };
}

describe("property snapshots and feedback", () => {
  it("detects field changes and preserves current evidence", () => {
    const changes = diffPropertySnapshots(snapshot({ priceCny: 1_000_000 }), snapshot({ priceCny: 1_100_000, areaSqm: 89 }, "2026-09-19T00:00:00.000Z"));
    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "priceCny", before: 1_000_000, after: 1_100_000, evidenceIds: ["evidence-1"] }),
      expect.objectContaining({ field: "areaSqm", before: undefined, after: 89 }),
    ]));
  });

  it("persists and filters snapshots by candidate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sourceport-property-snapshots-"));
    directories.push(directory);
    const store = createFilePropertySnapshotStore(directory);
    await store.save(snapshot({ priceCny: 1_000_000 }));
    await store.save({ ...snapshot({ priceCny: 1_100_000 }, "2026-09-19T00:00:00.000Z"), id: "snapshot-other", candidateId: "candidate-2" });
    expect((await store.list("candidate-1")).map((item) => item.fields.priceCny)).toEqual([1_000_000]);
    expect((await store.list()).length).toBe(2);
  });

  it("clusters repeated feedback without treating one complaint as a fact", () => {
    const clusters = clusterPropertyFeedback([
      { id: "1", candidateId: "candidate-1", source: "source-a", summary: "物业费争议", topics: ["property-management"], severity: "high", evidenceIds: ["e1"] },
      { id: "2", candidateId: "candidate-1", source: "source-b", summary: "物业服务问题", topics: ["property-management"], severity: "medium", evidenceIds: ["e2"] },
      { id: "3", candidateId: "candidate-1", source: "source-c", summary: "再次提及", topics: ["property-management"], evidenceIds: ["e3"] },
    ]);
    expect(clusters[0]).toEqual(expect.objectContaining({ signal: "pause", sourceCount: 3, evidenceIds: ["e1", "e2", "e3"] }));
  });
});
