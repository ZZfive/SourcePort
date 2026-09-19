import type { PropertyCandidateInput } from "./contracts.js";

const normalize = (value: string | undefined) => (value ?? "").normalize("NFKC").toLowerCase().replace(/[\s，。！？、,:：;；'"“”‘’()（）]/g, "");

export function propertyIdentityKey(candidate: PropertyCandidateInput): string {
  if (candidate.building && candidate.unit && candidate.room) return `${normalize(candidate.city)}:${normalize(candidate.community)}:${normalize(candidate.building)}:${normalize(candidate.unit)}:${normalize(candidate.room)}`;
  if (candidate.building && candidate.unit) return `${normalize(candidate.city)}:${normalize(candidate.community)}:${normalize(candidate.building)}:${normalize(candidate.unit)}`;
  return `candidate:${candidate.candidateId}`;
}

export function deduplicatePropertyCandidates(input: readonly PropertyCandidateInput[]): PropertyCandidateInput[] {
  const groups = new Map<string, PropertyCandidateInput>();
  for (const candidate of input) {
    const key = propertyIdentityKey(candidate);
    const existing = groups.get(key);
    if (!existing) {
      const listings = [...(candidate.listing ? [candidate.listing] : []), ...(candidate.listings ?? [])];
      groups.set(key, { ...candidate, observations: [candidate], priceObservations: [...(candidate.priceObservations ?? [])], ...(listings[0] ? { listing: { ...listings[0] } } : {}), listings, sourceUrls: [...new Set([...(candidate.sourceUrls ?? []), ...listings.map((item) => item.sourceUrl)])] });
      continue;
    }
    const listings = [...(existing.listings ?? (existing.listing ? [existing.listing] : [])), ...(candidate.listing ? [candidate.listing] : []), ...(candidate.listings ?? [])];
    const evidence = [...(existing.evidence ?? []), ...(candidate.evidence ?? [])];
    groups.set(key, {
      ...existing,
      observations: [...(existing.observations ?? [existing]), ...(candidate.observations ?? [candidate])],
      ...(existing.listing ? { listing: existing.listing } : candidate.listing ? { listing: candidate.listing } : {}),
      listings: [...new Map(listings.map((item) => [item.listingId, item])).values()],
      costEvidence: [...(existing.costEvidence ?? []), ...(candidate.costEvidence ?? [])],
      riskEvidence: [...(existing.riskEvidence ?? []), ...(candidate.riskEvidence ?? [])],
      ...(existing.askingPrice === undefined && candidate.askingPrice ? { askingPrice: candidate.askingPrice } : {}),
      priceObservations: [...(existing.priceObservations ?? []), ...(candidate.priceObservations ?? [])],
      evidence: [...new Map(evidence.map((item) => [item.id, item])).values()],
      sourceUrls: [...new Set([...(existing.sourceUrls ?? []), ...(candidate.sourceUrls ?? []), ...listings.map((item) => item.sourceUrl)])],
    });
  }
  return [...groups.values()];
}
