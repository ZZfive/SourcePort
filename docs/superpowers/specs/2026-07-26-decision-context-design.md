# SourcePort Decision Context Design

Date: 2026-07-26

Status: Approved target design

## Boundary

SourcePort core continues to own acquisition contracts, routing, evidence,
freshness, health, and recovery. It does not classify an event as dangerous,
rank a product from sentiment, or make a purchase decision.

`@sourceport/decision-context` is a consumer package. It collects a bounded
evidence corpus, applies source-admission rules, validates agent-authored
assessments, and derives transparent decision flags. Domain consumers build
subjects and queries. The first domain consumer is car research; housing is
deliberately deferred.

## Pipeline

1. A domain consumer creates a `DecisionContextBrief` containing evidenced
   subjects, explicit investigations, and bounded source queries.
2. SourcePort adapters retrieve official notices, media documents, discovery
   results, owner posts, and comments through ordinary source operations.
3. The decision-context collector normalizes and deduplicates documents and
   retains every warning, recovery action, failed query, and evidence record.
4. An agent creates a structured assessment referencing corpus document and
   evidence IDs.
5. Deterministic validation rejects unsupported claims and derives advisory
   flags: `context-only`, `watch`, `verify-before-buy`, or `pause`.

The advisory report never mutates car eligibility or deterministic ordering.

## Evidence Rules

- Discovery snippets are leads, not confirmation.
- Official primary evidence can confirm scope, batches, penalties, recalls, and
  remediation. Media can support or discover a claim but cannot alone confirm
  official remediation.
- A supplier event is direct only when an evidenced relationship connects the
  supplier to the exact subject, trim, or affected batch.
- Repeated owner experience requires at least three distinct documents or
  authors. Cross-source recurrence also requires two source families.
- Unknown publication dates remain unknown and cannot be described as recent.
- `pause` requires direct applicability, high or critical severity, unresolved
  remediation, and official-primary or independently cross-verified support.

## Initial Sources

- SAMR official notices: search and detail.
- Brave Search: API when configured, otherwise the existing OpenCLI browser
  adapter. Results are discovery evidence.
- 36kr: article search and detail as secondary media evidence.
- Xiaohongshu: note search, detail, and bounded comments as community evidence.
- Dongchedi owner reviews already present in the car report are reused without
  another live acquisition.

Arbitrary public-web page reading is outside this milestone.

## Compatibility

Existing `sourceport research-cars` behavior remains unchanged unless the new
context workflow is invoked. The generic source executor becomes a core
utility, while the current car-research exports remain compatibility aliases.
