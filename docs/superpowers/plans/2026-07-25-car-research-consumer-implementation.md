# SourcePort Car Research Consumer Implementation Plan

Date: 2026-07-25

## Execution Status

Implemented and live verified, merged and pushed to `main`, then installed
from the published GitHub path and forward verified in a fresh Codex task. The
implementation baseline before this documentation closeout was `a2b1706`.

Delivered:

- `dongchedi.get-series` and `dongchedi.get-owner-reviews`;
- `@sourceport/car-research` with open criteria, bounded discovery, exact
  cross-source matching, auditable on-road cost status, exact-trim assistance
  evaluation, and deterministic ordering;
- `sourceport research-cars` JSON and Markdown output;
- the thin repository-owned `skills/research-cars` Skill;
- fixture end-to-end coverage and a bounded Wuhan live acceptance.

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

## Verification Gate (Completed)

The implementation must keep all existing tests passing and add coverage for
the new adapters, health mapping, open criteria, unknown semantics, entity
resolution, cost ranges, deterministic ordering, CLI behavior, and fixture E2E.

The completed merge gate required:

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

## Verification Record

Automated verification on 2026-07-25:

- `npm run typecheck`: passed;
- `npm test`: 31 test files and 143 tests passed;
- `npm run build`: passed;
- Skill Creator `quick_validate.py skills/research-cars`: passed.

Live source health:

- Autohome: `healthy`, `available=true`; `list-brand-series` and
  `get-series-score` were healthy.
- Dongchedi: `degraded`, `available=true`; public entry points required login,
  while the connected browser fallback kept all five operations available.
- The browser `get-owner-reviews` and `list-trims` probes reused the logged-in
  page for SSR fetches, each completing in about 1.2 seconds in the final
  doctor run.

Bounded Wuhan live acceptance query:

> Wuhan purchase, on-road price no higher than CNY 150,000, no private charger,
> driving assistance preferred, SUV preferred but sedan acceptable.

The input seeds were `星越L`, `博越L`, `星瑞`, `风云T9`, and `长安启源Q05`.
The report returned `partial` with no warnings or recovery actions because the
hard budget condition correctly remained unresolved, not because a source was
blocked.

| Measure | Result |
|---|---:|
| attempted / validated seeds | 5 / 5 |
| expanded series | 8 |
| scanned series | 5 |
| exact configurations retrieved | 3 |
| final candidates | 5 |
| exact Autohome matches | 4 |

Exact matches were `星越L` (`4857` / `6004`), `星瑞` (`3476` / `5273`),
`博越L` (`6025` / `6814`), and `长安启源Q05` (`25634` / `8241`). `风云T9`
remained explicitly `unmatched`: Dongchedi classified it under `奇瑞汽车`,
while Autohome placed it under `奇瑞风云`. The engine did not add an implicit
brand alias or force the merge.

Every candidate had a budget status and assistance status. Budget was
`unknown` for all candidates because Wuhan transaction price, purchase tax,
insurance, and registration evidence was missing. Exact-trim assistance checks
passed for `星越L` and `星瑞`, failed the requested lane-centering preference
for the inspected `博越L` trim, and remained unknown where the three-trim
configuration budget did not reach a candidate. No-private-charger remained a
context criterion and did not exclude any powertrain.

Coverage remained bounded to the declared seeds, expansion and scan limits,
Dongchedi and Autohome, and three exact configuration fetches. This verification
does not establish full-market coverage or a current Wuhan dealer quotation.

## Installed Skill Forward Verification

After `main` was pushed, the Skill was installed from the published GitHub path
and compared byte-for-byte with `skills/research-cars`. A fresh Codex task then
used `$research-cars` for the same Wuhan decision boundary without receiving the
expected candidates or report contents.

The task independently:

- found `sourceport` on `PATH`;
- ran both source doctors and continued through Dongchedi only because all
  required operations remained available through the logged-in fallback;
- classified budget as hard, assistance and body style as preferences, and no
  private charger as context;
- generated eight seed hypotheses and executed a live bounded report;
- returned five `needs-verification` candidates, zero eligible candidates, and
  zero evidence-backed hard-condition rejections;
- preserved all Wuhan on-road budget decisions as `unknown`;
- reported exact-trim assistance evidence only when configuration retrieval
  succeeded;
- stated the bounded coverage and did not describe the result as a market-wide
  search.

The forward run also exposed two workflow gaps. First, its complete JSON output
exceeded the terminal capture limit, so the task repeated the same live research
in Markdown and took about 21 minutes end to end. Second, Autohome rejected the
common manufacturer spellings `零跑汽车`, `深蓝汽车`, and `小鹏汽车` before
cross-source matching.

Commit `860e4f7` addressed both findings:

- the Skill now chooses one primary output before execution, uses Markdown for
  ordinary user-facing comparisons, starts an open-ended first pass with five
  seeds and three exact configurations, and forbids a second live run solely to
  switch formats or recover truncated output;
- Autohome brand-initial resolution now normalizes the common `汽车` suffix and
  includes the missing base brands.

Post-fix live probes resolved `零跑B10` to Autohome `7877`, `深蓝S05` to
`7740`, and `小鹏MONA M03` to `6998`. Fresh Codex tasks loaded the updated Skill
and explicitly selected one Markdown execution; their external commands then
requested task-level user approval. No second live run was claimed or inferred
from that approval boundary. The original completed live forward task satisfies
the planned forward-verification gate, while the post-fix source probes and
fresh-task behavior verify the identified corrections directly.
