import { freshness as snapshotFreshness, type MarketEvent, type VehicleSnapshot } from "@sourceport/market-intelligence";
import type { FeedbackCluster } from "@sourceport/market-feedback";
import type { CarResearchReport } from "./contracts.js";

export interface ReportEnrichmentInput {
  snapshots?: readonly VehicleSnapshot[];
  marketEvents?: readonly MarketEvent[];
  feedbackClusters?: readonly FeedbackCluster[];
  now?: Date;
}

/** Attach independently collected market evidence without changing eligibility. */
export function enrichCarResearchReport(
  report: CarResearchReport,
  input: ReportEnrichmentInput,
): CarResearchReport {
  const now = input.now ?? new Date();
  const snapshots = input.snapshots ?? [];
  const statuses = snapshots.map((snapshot) => snapshotFreshness(snapshot, now));
  const freshness = statuses.includes("stale") ? "stale" : statuses.includes("aging") ? "aging" : statuses.includes("unverified") ? "unverified" : statuses.length ? "fresh" : undefined;
  const latest = snapshots.map((snapshot) => snapshot.capturedAt).sort().at(-1);
  const candidateSeries = new Set(report.candidates.map((candidate) => candidate.series.name));
  const marketChanges = (input.marketEvents ?? []).filter((event) => {
    const snapshot = snapshots.find((item) => item.seriesId === event.seriesId);
    return !snapshot || candidateSeries.has(snapshot.series);
  }).map((event) => ({
    seriesId: event.seriesId,
    kind: event.kind,
    summary: event.changes.map((change) => `${change.field}: ${String(change.before ?? "new")} -> ${String(change.after ?? "removed")}`).join("; "),
    evidenceIds: event.evidenceIds,
  }));
  const feedback = (input.feedbackClusters ?? []).filter((cluster) => candidateSeries.has(cluster.series)).map((cluster) => ({
    series: cluster.series,
    topic: cluster.topic,
    signal: cluster.signal,
    rationale: cluster.rationale,
    evidenceIds: cluster.evidenceIds,
  }));
  return {
    ...report,
    ...(latest ? { dataAsOf: latest } : {}),
    ...(freshness ? { freshness } : {}),
    ...(marketChanges.length ? { marketChanges } : {}),
    ...(feedback.length ? { feedbackClusters: feedback } : {}),
  };
}
