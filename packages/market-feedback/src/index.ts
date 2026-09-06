export type FeedbackSource = "12365auto" | "dongchedi" | "xiaohongshu" | "media" | "official";
export type MarketSignal = "insufficient-evidence" | "watch" | "verify-before-buy" | "pause" | "resolved";
export interface FeedbackRecord { id: string; source: FeedbackSource; sourceUrl?: string; brand: string; series: string; modelYear?: string; trimId?: string; submittedAt?: string; summary: string; categories: string[]; severity?: "low" | "medium" | "high"; officialConfirmed?: boolean; manufacturerResponse?: string; status?: string; evidenceIds: string[]; }
export interface FeedbackCluster { id: string; brand: string; series: string; modelYears: string[]; trimIds: string[]; topic: string; records: FeedbackRecord[]; firstSeenAt?: string; lastSeenAt?: string; sourceCount: number; signal: MarketSignal; rationale: string; evidenceIds: string[]; }
export function normalize12365Complaints(input: readonly Record<string, unknown>[]): FeedbackRecord[] {
  return input.flatMap((item) => {
    const id = String(item.complaintId ?? item.id ?? "").trim();
    const brand = String(item.brand ?? "").trim();
    const series = String(item.series ?? "").trim();
    const summary = String(item.summary ?? item.problem ?? "").trim();
    if (!id || !brand || !series || !summary) return [];
    const categories = Array.isArray(item.categories) ? item.categories.filter((x): x is string => typeof x === "string") : [];
    return [{ id: `12365auto:${id}`, source: "12365auto" as const, ...(item.url ? { sourceUrl: String(item.url) } : {}), brand, series, ...(item.modelYear ? { modelYear: String(item.modelYear) } : {}), ...(item.trimId ? { trimId: String(item.trimId) } : {}), ...(item.submittedAt ? { submittedAt: String(item.submittedAt) } : {}), summary, categories, ...(item.severity === "high" || item.severity === "medium" || item.severity === "low" ? { severity: item.severity } : {}), ...(item.manufacturerResponse ? { manufacturerResponse: String(item.manufacturerResponse) } : {}), ...(item.status ? { status: String(item.status) } : {}), evidenceIds: [item.evidenceId ? String(item.evidenceId) : `12365auto:${id}`] }];
  });
}
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[，。！？、,:：;；\s]+/g, "");
const canonicalTopic = (record: FeedbackRecord) => {
  const text = normalize(`${record.categories.join(" ")} ${record.summary}`);
  if (/车机|黑屏|死机|导航|屏幕/.test(text)) return "infotainment";
  if (/电池|续航|充电|自燃|热失控/.test(text)) return "battery";
  if (/辅助驾驶|智驾|领航|自动泊车/.test(text)) return "adas";
  if (/异响|噪音|震动/.test(text)) return "noise";
  return normalize(record.categories[0] ?? record.summary.slice(0, 18));
};
export function feedbackSignal(records: readonly FeedbackRecord[]): MarketSignal {
  const sources = new Set(records.map((record) => record.source));
  const resolved = records.some((record) => /解决|修复|完成整改|召回/.test(record.manufacturerResponse ?? ""));
  const unresolvedAfterResolution = resolved && records.some((record) => record.submittedAt && /解决|修复|完成整改|召回/.test(record.manufacturerResponse ?? "") === false);
  const officialUnresolved = records.some((record) => record.officialConfirmed && (record.severity === "high" || /安全|自燃|热失控|制动/.test(record.summary)) && !/解决|修复|完成整改|召回/.test(record.manufacturerResponse ?? ""));
  if (officialUnresolved) return "pause";
  if (unresolvedAfterResolution && records.length >= 3) return "verify-before-buy";
  if (resolved && records.every((record) => /解决|修复|完成整改|召回/.test(record.manufacturerResponse ?? ""))) return "resolved";
  if (records.length >= 3 && sources.size >= 2) return "verify-before-buy";
  if (records.length >= 3) return "watch";
  return "insufficient-evidence";
}
export function clusterFeedback(records: readonly FeedbackRecord[]): FeedbackCluster[] {
  const groups = new Map<string, FeedbackRecord[]>();
  for (const record of records) { const topic = canonicalTopic(record); const key = `${normalize(record.brand)}:${normalize(record.series)}:${topic}`; groups.set(key,[...(groups.get(key) ?? []),record]); }
  return [...groups].map(([key, items]) => { const first=items.map(x=>x.submittedAt).filter(Boolean).sort()[0]; const last=items.map(x=>x.submittedAt).filter(Boolean).sort().at(-1); const sources=new Set(items.map(x=>x.source)); const resolved=items.some(x=>/解决|修复|完成整改|召回/.test(x.manufacturerResponse ?? "")); const officialUnresolved=items.some(x=>x.officialConfirmed && (x.severity === "high" || /安全|自燃|热失控|制动/.test(x.summary)) && !/解决|修复|完成整改|召回/.test(x.manufacturerResponse ?? "")); const signal=feedbackSignal(items); return { id:`feedback:${key}`,brand:items[0]!.brand,series:items[0]!.series,modelYears:[...new Set(items.map(x=>x.modelYear).filter((x):x is string=>Boolean(x)))],trimIds:[...new Set(items.map(x=>x.trimId).filter((x):x is string=>Boolean(x)))],topic:key.split(":").at(-1) ?? "unknown",records:items,...(first ? {firstSeenAt:first} : {}),...(last ? {lastSeenAt:last} : {}),sourceCount:sources.size,signal,rationale:`${items.length} records from ${sources.size} source(s); official unresolved high-severity=${officialUnresolved}; manufacturer resolution=${resolved}`,evidenceIds:[...new Set(items.flatMap(x=>x.evidenceIds))]}; });
}
