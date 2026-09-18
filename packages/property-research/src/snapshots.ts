export interface PropertySnapshot {
  id: string;
  capturedAt: string;
  candidateId: string;
  city: string;
  community: string;
  building?: string;
  unit?: string;
  room?: string;
  fields: Record<string, unknown>;
  sourceEvidenceIds: string[];
}

export interface PropertySnapshotStore {
  save(snapshot: PropertySnapshot): Promise<void>;
  list(candidateId?: string): Promise<PropertySnapshot[]>;
}

export interface PropertySnapshotChange {
  field: string;
  before: unknown;
  after: unknown;
  evidenceIds: string[];
}

export function diffPropertySnapshots(previous: PropertySnapshot | undefined, current: PropertySnapshot): PropertySnapshotChange[] {
  if (!previous) return Object.keys(current.fields).map((field) => ({ field, before: undefined, after: current.fields[field], evidenceIds: current.sourceEvidenceIds }));
  const fields = new Set([...Object.keys(previous.fields), ...Object.keys(current.fields)]);
  return [...fields]
    .filter((field) => JSON.stringify(previous.fields[field]) !== JSON.stringify(current.fields[field]))
    .map((field) => ({ field, before: previous.fields[field], after: current.fields[field], evidenceIds: current.sourceEvidenceIds }));
}

export interface PropertyFeedbackRecord {
  id: string;
  candidateId: string;
  source: string;
  summary: string;
  topics: string[];
  observedAt?: string;
  severity?: "low" | "medium" | "high";
  evidenceIds: string[];
}

export interface PropertyFeedbackCluster {
  id: string;
  candidateId: string;
  topic: string;
  records: PropertyFeedbackRecord[];
  sourceCount: number;
  signal: "insufficient-evidence" | "watch" | "verify-before-buy" | "pause";
  evidenceIds: string[];
}

export function clusterPropertyFeedback(records: readonly PropertyFeedbackRecord[]): PropertyFeedbackCluster[] {
  const groups = new Map<string, PropertyFeedbackRecord[]>();
  for (const record of records) {
    const topics = record.topics.length ? record.topics : ["unclassified"];
    for (const topic of topics) {
      const key = `${record.candidateId}:${topic.normalize("NFKC").toLowerCase()}`;
      groups.set(key, [...(groups.get(key) ?? []), record]);
    }
  }
  return [...groups.entries()].map(([key, items]) => {
    const sources = new Set(items.map((item) => item.source));
    const highSeverity = items.some((item) => item.severity === "high");
    const signal = highSeverity && items.length >= 2
      ? "pause"
      : items.length >= 3 && sources.size >= 2
        ? "verify-before-buy"
        : items.length >= 2
          ? "watch"
          : "insufficient-evidence";
    return {
      id: `property-feedback:${key}`,
      candidateId: items[0]!.candidateId,
      topic: key.split(":").at(-1) ?? "unclassified",
      records: items,
      sourceCount: sources.size,
      signal,
      evidenceIds: [...new Set(items.flatMap((item) => item.evidenceIds))],
    };
  });
}

export function createFilePropertySnapshotStore(directory: string): PropertySnapshotStore {
  return {
    async save(snapshot) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      await mkdir(directory, { recursive: true });
      const safe = snapshot.id.replace(/[^a-zA-Z0-9._-]/g, "_");
      await writeFile(`${directory}/${safe}.json`, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    },
    async list(candidateId) {
      const { readdir, readFile } = await import("node:fs/promises");
      let names: string[];
      try { names = await readdir(directory); } catch { return []; }
      const snapshots: PropertySnapshot[] = [];
      for (const name of names.filter((item) => item.endsWith(".json"))) {
        try {
          const value = JSON.parse(await readFile(`${directory}/${name}`, "utf8")) as PropertySnapshot;
          if (!candidateId || value.candidateId === candidateId) snapshots.push(value);
        } catch {
          // Keep corrupt snapshots out of the timeline; provenance remains in valid files.
        }
      }
      return snapshots.sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    },
  };
}
