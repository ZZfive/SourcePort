export type FreshnessStatus = "fresh" | "aging" | "stale" | "unverified";
export type MarketEventKind = "launch" | "facelift" | "new-trim" | "price-change" | "configuration-change" | "adas-update" | "discontinued";
export interface VehicleSnapshot { id: string; seriesId: string; trimId?: string; brand: string; series: string; modelYear?: string; capturedAt: string; validUntil?: string; fields: Record<string, unknown>; sourceEvidenceIds: string[]; }
export interface VehicleChange { field: string; before: unknown; after: unknown; kind: MarketEventKind; evidenceIds: string[]; }
export interface MarketEvent { id: string; kind: MarketEventKind; seriesId: string; trimId?: string; occurredAt?: string; detectedAt: string; changes: VehicleChange[]; evidenceIds: string[]; }
export function freshness(snapshot: VehicleSnapshot, now = new Date()): FreshnessStatus {
  if (!snapshot.validUntil) return "unverified";
  const until = Date.parse(snapshot.validUntil);
  if (!Number.isFinite(until)) return "unverified";
  const age = until - now.getTime();
  if (age >= 14 * 86400000) return "fresh";
  if (age >= 0) return "aging";
  return "stale";
}
function eventKind(field: string): MarketEventKind {
  const key = field.toLowerCase();
  if (/price|价格/.test(key)) return "price-change";
  if (/adas|assistance|辅助驾驶|智驾/.test(key)) return "adas-update";
  if (/config|配置|hardware|硬件/.test(key)) return "configuration-change";
  return "configuration-change";
}
export function diffSnapshots(previous: VehicleSnapshot | undefined, current: VehicleSnapshot): VehicleChange[] {
  if (!previous) return Object.keys(current.fields).map((field) => ({ field, before: undefined, after: current.fields[field], kind: "launch", evidenceIds: current.sourceEvidenceIds }));
  const keys = new Set([...Object.keys(previous.fields), ...Object.keys(current.fields)]);
  return [...keys].filter((field) => JSON.stringify(previous.fields[field]) !== JSON.stringify(current.fields[field]))
    .map((field) => ({ field, before: previous.fields[field], after: current.fields[field], kind: eventKind(field), evidenceIds: current.sourceEvidenceIds }));
}
export function detectMarketEvent(previous: VehicleSnapshot | undefined, current: VehicleSnapshot): MarketEvent | undefined {
  const changes = diffSnapshots(previous, current);
  if (!changes.length && previous) return undefined;
  return { id: `market:${current.id}:${current.capturedAt}`, kind: previous ? (changes[0]?.kind ?? "configuration-change") : "launch", seriesId: current.seriesId, ...(current.trimId ? { trimId: current.trimId } : {}), detectedAt: current.capturedAt, changes, evidenceIds: [...new Set(changes.flatMap((change) => change.evidenceIds))] };
}
