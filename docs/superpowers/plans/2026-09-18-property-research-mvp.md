# Configurable Property Research MVP

## Scope

The decision contract reads the market, housing types, all-in budget, layout,
and commute anchors from runtime input. Checked-in examples are synthetic.

The all-in ceiling is a hard criterion. Purchase price, deed tax, VAT, agency
fee, registration, maintenance fund, renovation, parking, and loan fees remain
separate evidence-backed components. Missing components produce an explicit
estimate or unknown status.

The two commute anchors are evaluated independently. No commute ceiling is
invented until the user supplies one, so commute evidence currently affects
ordering and reporting rather than hard eligibility.

## Delivered

- `@sourceport/property-research` contracts and validation;
- new/resale candidate identity and exact-unit deduplication;
- all-in cost aggregation with missing-component reporting;
- equal-payment mortgage calculation and explicit mortgage-scenario helper;
- budget, layout, commute, and property-risk criterion evaluation;
- eligible, needs-verification, and rejected candidate states;
- bounded report coverage and Markdown rendering;
- `sourceport research-property` CLI with normalized candidate fixtures;
- `research-property` orchestration Skill;
- deterministic tests for costs, monthly payment, candidate separation,
  unknown evidence, and CLI sidecars.

## Official source phase delivered

- Added `@sourceport/wuhan-housing` with the allowlisted `get-official-page`
  operation;
- public HTTP, OpenCLI browser fallback, manual recovery, parser checks, and
  doctor probe are all represented in the operation contract;
- verified official Wuhan mortgage and presale-query pages are documented as
  source probes, while exact-property claims remain unresolved until a
  project/property document is supplied.

## Listing source phase delivered

- Added `@sourceport/wuhan-listings` with bounded `search-listings` and
  `get-listing` operations;
- the Wuhan Fang.com public route is live in the current environment and
  returns normalized `lead-only` observations with evidence URLs and retrieval
  times;
- Lianjia/Beike and browser/manual paths remain allowlisted or explicitly
  diagnosed, but listing output is never silently combined with official title
  or transaction evidence.

## Next source phases

1. Add official tax, transaction, planning, and ownership evidence adapters
   with doctor probes and recovery actions.
2. Add route evidence for both commute anchors and preserve retrieval time and
   route assumptions.
3. Add property snapshots and feedback clusters only after exact community and
   building identity can be resolved.

The current CLI accepts normalized candidate fixtures so these source phases
can be tested independently from the deterministic research engine:

```bash
sourceport research-property \
  --input-file private/property-brief.json \
  --candidates-file normalized-candidates.json \
  --format md \
  --report-file property-report.json
```
