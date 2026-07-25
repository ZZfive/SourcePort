# SourcePort Car Research Consumer Implementation Plan

Date: 2026-07-25

## Objective

Complete SourcePort's first bounded consumer proof for the query:

> Buy a car in Wuhan with an on-road budget no higher than CNY 150,000, no
> private charger, driving-assistance capability preferred, SUV preferred but
> sedans acceptable.

The deliverables are:

1. two additional Dongchedi retrieval operations;
2. a deterministic `@sourceport/car-research` consumer package;
3. a `sourceport research-cars` CLI command;
4. a thin `research-cars` Codex skill.

The result is explicitly bounded research, not an exhaustive market catalog or
an autonomous purchase recommendation.

## Boundary

- Source adapters retrieve and normalize source evidence.
- The consumer package performs cross-source matching, criterion evaluation,
  bounded filtering, deterministic ordering, and evidence propagation.
- The skill interprets natural-language intent and orchestrates the CLI; it
  does not duplicate deterministic business logic.
- Unknown criteria, prices, configurations, source conflicts, authentication,
  captcha, and coverage limitations remain explicit.

## Delivery Sequence

1. Reconcile historical execution status.
2. Add `dongchedi.get-series` and `dongchedi.get-owner-reviews` with health
   probes and contract tests.
3. Add open-ended research contracts and a bounded research engine.
4. Add JSON and Markdown CLI output.
5. Add and validate the repository-owned Codex skill.
6. Run fixture end-to-end tests and a bounded Wuhan live acceptance.
7. Reconcile README and verification evidence before merge.

## Bounded Execution Limits

- initial seeds: at most 8;
- expanded series: at most 12;
- series scanned for trims: at most 8;
- exact trim configurations: at most 6;
- final candidates: at most 5;
- owner reviews per series: at most 5.

Candidate seeds are hypotheses until a SourcePort source operation validates or
rejects them. Cross-source matching uses stable IDs within a source and exact
normalized brand/name matching across sources; ambiguous matches remain
`conflict` or `unmatched`.

## Decision Semantics

Each criterion result is `pass`, `fail`, `unknown`, `conflict`, or
`unsupported` and points to evidence IDs where evidence exists.

- A confirmed hard-condition failure rejects a candidate.
- An unknown hard condition produces `needs-verification`, not a recommendation.
- Unsupported criteria are returned intact.
- No private charger is context unless the user explicitly converts it into a
  powertrain exclusion.
- Driving assistance is modeled by exact trim, claimed level, operating domain,
  capabilities, hardware, system/version, optional packages, subscription,
  market, and evidence. It is never a universal boolean.
- On-road price is known only when all mandatory cost components have dated,
  applicable evidence; otherwise budget status is `unknown`.

## Verification

The implementation must keep all existing tests passing and add coverage for
the new adapters, health mapping, open criteria, unknown semantics, entity
resolution, cost ranges, deterministic ordering, CLI behavior, and fixture E2E.

Before merge, run:

```bash
npm run typecheck
npm test
npm run build
node packages/cli/dist/main.js doctor autohome --json
node packages/cli/dist/main.js doctor dongchedi --json
```

The bounded Wuhan acceptance must validate or reject at least five seeds,
resolve at least three series to exact trims, retrieve at least three exact
configurations, and cross-check at least two candidates with Autohome or mark
them explicitly unmatched. Authentication or captcha stops the affected live
path and reports recovery actions; it is never bypassed.
