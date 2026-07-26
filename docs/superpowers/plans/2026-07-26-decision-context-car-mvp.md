# Decision Context and Car Context MVP Implementation

Date: 2026-07-26

Status: Implemented, merged, pushed, and installed on 2026-07-26. Implementation
commit `a8d1c5c` is contained in local and remote `main`, and the installed
`research-cars` Skill matches the repository copy.

## Execution Status

| Milestone | Status | Verification gate |
|---|---|---|
| Generic executor and OpenCLI classification | Complete | Core unit tests, compatibility exports, typecheck |
| SAMR, Brave, 36kr, Xiaohongshu adapters | Complete with live degradation recorded | Fixtures plus operation-level doctor and bounded live collection |
| `@sourceport/decision-context` | Complete | Contract, collection, validation, compiler, flag, and renderer tests |
| Car context planning and CLI | Complete | Candidate-only integration, sidecars, partial-source behavior, unchanged eligibility/order |
| Skill and documentation | Complete and forward-verified | Skill validation, bilingual README, separate fresh-task forward validation |

## Required Commands

```text
sourceport research-cars ... --format md --report-file car-report.json
sourceport car-context collect --report-file car-report.json --format md \
  --corpus-file context-corpus.json
sourceport context collect --input-file context-brief.json --format md \
  --corpus-file context-corpus.json
sourceport context compile --corpus-file context-corpus.json \
  --assessment-file assessment.json --format md \
  --report-file context-report.json
```

## Acceptance

- Only final non-rejected candidates are investigated, with at most five
  candidates and the approved global query/document/detail limits.
- Optional-source failures yield a partial corpus without erasing useful
  evidence or blocking the existing car report.
- Discovery-only evidence cannot confirm events. Supplier-only events remain
  indirect unless exact applicability is evidenced.
- Context flags do not change candidate eligibility or hidden ordering.
- Tests, typecheck, build, source doctors, and a bounded live car-context run
  pass before the milestone is described as complete.

Merge, push, and installed-Skill replacement were explicitly authorized and
completed on 2026-07-26. Branch deletion remains a separate gate and was not
performed.

## Verification evidence

Local deterministic verification on 2026-07-26 covers:

- duplicate IDs, invalid dates and limits, invalid document/evidence references;
- discovery-only event rejection, official recall flags, completed remediation,
  supplier indirectness, owner recurrence, cross-source recurrence, conflicts,
  and unknown-date language;
- content/URL/source-ID deduplication, note/comment limits, and optional-source
  partial results;
- two candidates sharing one manufacturer query and unchanged car eligibility
  and ordering;
- CLI JSON sidecars for paper reports, corpora, and compiled context reports.

Point-in-time live doctor evidence:

- `brave-search`: healthy and available through the OpenCLI browser; no Brave
  API key was configured;
- `36kr`: both search and detail healthy and available;
- `samr`: degraded but available; static search drifted, browser search fallback
  worked, and public notice detail worked;
- `xiaohongshu`: degraded and unavailable in the current session; search timed
  out or required human verification and detail operations required a valid
  signed note URL. Recovery remains explicit and does not block other sources.

A bounded live collect returned a partial corpus with official SAMR recall
details, Brave discovery leads, three 36kr detail documents, and an explicit
Xiaohongshu recovery action. Deterministic compilation accepted an official,
direct, high-severity, unresolved P7+ recall assessment and derived `pause`
without changing any car-research eligibility state.

A separate fresh-task Skill forward validation completed on 2026-07-26 with a
single two-candidate car run and complete JSON sidecars. It retained two
`eligible` candidates in their paper-data order, produced a 32-document partial
corpus, and compiled successfully with exit code `1` because source coverage was
partial. In that run the P7+ recall remained `unverified/unknown` and therefore
`context-only` because the official detail body could not be admitted; the AION
S battery event remained `single-source/unknown` and therefore `watch` because
the selected 2025 trim could not be connected to the reported 2022-2023 177Ah
operating-vehicle batches. Xiaohongshu login and SAMR detail failures remained
explicit, and the SourcePort repository was not modified by the forward task.
