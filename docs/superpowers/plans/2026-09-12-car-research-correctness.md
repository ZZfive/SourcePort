# Car research correctness closeout — 2026-09-12

## Scope and reasoning

This change repairs the bounded car-research consumer after a shortlist omitted
user-interest models and failed to interpret available assistance evidence.
It does not add ranking or car-specific decisions to SourcePort core.

The deterministic questions were whether discovery retained returned catalogue
models, budgets reached multiple series, exact-trim evidence changed selection,
unknowns stayed visible, and report claims matched evidence. Competing causes
were source absence, narrow discovery/admission, budget starvation, and parser /
evaluator loss. Recorded evidence and executable fixtures distinguish these;
newness alone does not explain a catalogue model being omitted.

Current market availability, transaction costs, delivery promises, and the
user's eventual preference remain uncertain. Research remains bounded; missing
evidence requires a targeted follow-up, not a confident recommendation.

## Implemented behavior and verification

| Problem | Final behavior | Executable verification |
| --- | --- | --- |
| Familiar seeds and competitor links miss catalogue entries | Enumerate relevant brand catalogues; accept dated, attributable release leads; explicit series and leads first, remaining catalogue entries in rounds across brands | `research-regressions.test.ts`: catalogue 银河TT and presale lead cases |
| An early series consumes configuration budget | Global attempt budget spent in rounds across series; failures still count | Global order and transport-failure regression cases |
| ADAS object presence substitutes for actual equipment | Evaluate every listed trim, select after hard conditions and preferences; preserve failed/uninspected trims and all representatives | Higher passing trim, unresolved higher trim, configuration identity mismatch cases |
| Requested capabilities collapse into one opaque result | Read operating domains and nested options; explicit aliases; preserve per-feature results; optional remains unresolved; conflicting evidence conflicts | `criteria-regressions.test.ts`: aliases, optional, contradictions, partial preference ordering |
| Navigation subtypes lost during normalization | Normalize high-speed and urban subitems independently; retain full original options | Dongchedi configuration parser suboption regression |
| Presentation cap hides unexplored or non-rejected cars | `discoveredSeries`, `evaluatedTrims`, `allCandidates`, warnings and Markdown matrices retain gaps with reasons | Ledger, display-cap and Markdown regressions |
| Purchase date stored without enforcement | Convert convenience target date to hard delivery criterion; require current, scoped commitments; preserve excluded evidence and conflict | Delivery boundary, stale/future/city/trim/series/estimate and missing-evidence cases |
| Reference vehicle price resembles an on-road total | Separate reference and evidenced total columns; missing costs remain unknown | Markdown price regression |
| Cost evidence can yield false completeness | Mandatory components required; duplicate required-component quotes need reconciliation; numeric and scope validation; supplied URLs remain claimed | Price reconciliation and input integrity tests |
| Enrichment promotes unresolved candidates | Unknown hard criteria or incomplete reports remain verify-before-buy; pause signals retained | Research/enrichment regressions |
| Skill hard-codes too small a first pass | Defaults: 8 seeds / 24 admitted / 8 scanned / 16 global configuration attempts / 5 displayed / 3 reviews; require attention to named cars and recent leads; allow justified follow-up | Skill validation and repository/installed-copy comparison |

Ordering is explicit: hard-condition eligibility, preferences by priority,
within a tied capability preference the number of requested capabilities with
passes, evidence completeness, source ratings, and stable ID. This does not
claim a quality score or rank unspecified preferences.

## Saved evidence replay

The built evaluator was run against the original local Dongchedi snapshots:

- C10 2026 增程式 210激光雷达版, trim `248017`, retrieved
  `2026-09-10T15:10:08.503Z`, evidence
  `sha256:eea49bafef7ec35242e52fa29a08cbee71ad2fda14c59503c1a9c579f954da52`.
- 海豚 2025 智驾版 420KM自由版, trim `243298`, retrieved
  `2026-09-10T15:10:20.536Z`, evidence
  `sha256:5736161d608c4171d8cb8ee7048f0115092109f8faa3a344ce8a41640101f2ff`.

Both now return `pass` for the supplied 高速领航辅助 criterion from the nested
saved evidence. The local replay artifact is
`reports/2026-09-12-car-research-regression-replay.json`; original report files
were preserved. This is an offline interpretation check, not a new live
availability, price, equipment, or delivery verification.

## Final checks

- `npm run typecheck`: passed during implementation.
- `npm run build`: passed after final source changes (TypeScript project build).
- `npm test`: **46 files, 224 tests passed** after final source changes.
- `git diff --check`: passed.
- `skill-creator/scripts/quick_validate.py`: repository and installed skill valid.
- `diff -qr skills/research-cars ~/.codex/skills/research-cars`: identical.
- Source CLI resolves to the installed local command; this work rebuilt its
  workspace implementation. No live source batch was repeated for formatting.

## Remaining evidence boundaries

The engine discovers only the selected brands, supplied leads and bounded
competitor links; it does not independently search all recent car announcements.
The consumer skill must discover current release evidence and keep the user's
named models visible, including unresolved names. Catalogue/source caps and
configuration budgets can still leave explicit gaps. A supplied market status
cannot establish on-sale trim availability or delivery by a deadline.

Optional features remain unresolved until package inclusion and applicable
cost can be evidenced. The implementation does not infer entitlement from an
option price. Supplied cost and delivery records preserve claimed provenance;
a source URL alone is not independent verification. Delivery commitment
acceptance verifies a dated promise, not the future delivery event.

The earlier purchasing report has not become current merely because the engine
was corrected. A new purchasing decision requires a new bounded research pass
with the user's named models and current local cost/delivery evidence.
