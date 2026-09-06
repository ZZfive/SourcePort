import { freshness as snapshotFreshness, type MarketEvent, type VehicleSnapshot } from "@sourceport/market-intelligence";
import type { FeedbackCluster } from "@sourceport/market-feedback";
import type { CarResearchReport } from "./contracts.js";

export interface ReportEnrichmentInput {
  snapshots?: readonly VehicleSnapshot[];
  marketEvents?: readonly MarketEvent[];
  feedbackClusters?: readonly FeedbackCluster[];
  now?: Date;
}

function actionItems(report: CarResearchReport, freshness: string | undefined, feedback: Array<{ signal: string }>): string[] {
  const actions = new Set<string>();
  if (report.candidates.some((candidate) => candidate.onRoadCost?.status === "unknown")) actions.add("向武汉经销商确认成交价、购置税、保险和上牌费用，并保存报价凭证");
  if (report.candidates.some((candidate) => candidate.eligibility === "needs-verification")) actions.add("逐项核对目标年款和具体款型的硬条件，缺失证据不得直接下单");
  if (report.candidates.some((candidate) => candidate.drivingAssistance === null)) actions.add("试驾前确认辅助驾驶硬件、软件版本、开通条件和地区适用性");
  if (freshness === "stale" || freshness === "aging") actions.add("刷新重点候选的价格、在售状态和辅助驾驶配置");
  if (feedback.some((cluster) => cluster.signal === "pause")) actions.add("在官方风险和整改状态核实前暂缓购买相关候选");
  if (feedback.some((cluster) => cluster.signal === "verify-before-buy" || cluster.signal === "watch")) actions.add("试驾时重点验证已聚类的用户反馈问题，并向售后确认处理方案");
  actions.add("确认目标款型的售后网点、质保条款、OTA 政策和交付周期");
  return [...actions];
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
  const feedback = (input.feedbackClusters ?? []).filter((cluster) => {
    const candidates = report.candidates.filter((candidate) => candidate.series.name === cluster.series);
    if (!candidates.length) return false;
    if (!cluster.trimIds.length) return true;
    return candidates.some((candidate) => cluster.trimIds.includes(candidate.trim.trimId));
  }).map((cluster) => ({
    series: cluster.series,
    topic: cluster.topic,
    signal: cluster.signal,
    rationale: cluster.rationale,
    ...(cluster.modelYears.length ? { modelYears: cluster.modelYears } : {}),
    ...(cluster.trimIds.length ? { trimIds: cluster.trimIds } : {}),
    ...(cluster.firstSeenAt ? { firstSeenAt: cluster.firstSeenAt } : {}),
    ...(cluster.lastSeenAt ? { lastSeenAt: cluster.lastSeenAt } : {}),
    sourceCount: cluster.sourceCount,
    evidenceIds: cluster.evidenceIds,
  }));
  const actions = actionItems(report, freshness, feedback);
  const pause = feedback.find((x) => x.signal === "pause");
  const verify = feedback.find((x) => x.signal === "verify-before-buy" || x.signal === "watch") || (freshness === "stale" || freshness === "aging" ? { signal: "stale", evidenceIds: [] as string[] } : undefined);
  const recommendation = pause
    ? { status: "pause" as const, rationale: "存在未解决的高严重度官方风险信号", evidenceIds: pause.evidenceIds }
    : verify
      ? { status: "verify-before-buy" as const, rationale: "市场反馈或数据时效要求买前核验", evidenceIds: verify.evidenceIds }
      : { status: "recommend" as const, rationale: "当前候选满足已知硬条件且没有升级风险信号", evidenceIds: report.candidates.flatMap((c) => c.evidenceIds) };
  return {
    ...report,
    ...(latest ? { dataAsOf: latest } : {}),
    ...(freshness ? { freshness } : {}),
    ...(marketChanges.length ? { marketChanges } : {}),
    ...(feedback.length ? { feedbackClusters: feedback } : {}),
    actionItems: actions,
    recommendation,
  };
}
