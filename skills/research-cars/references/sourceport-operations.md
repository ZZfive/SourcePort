# SourcePort Car Operations

Use `sourceport capabilities <source>` as the current authority. The expected
MVP operations are:

## Dongchedi

- `search-series`: search a car-series name and return stable series IDs.
- `get-series`: retrieve identity, price ranges, rating, review count, ranks,
  and on-sale trim count.
- `list-trims`: list exact on-sale or discontinued trim IDs and prices.
- `get-trim-configuration`: retrieve the exact trim's full configuration and
  structured driving-assistance evidence.
- `get-owner-reviews`: retrieve a bounded list of owner-review summaries and
  article URLs.

Dongchedi may use public HTTP first and a logged-in browser fallback. A
degraded doctor result can still be usable when the required operation says
`available=true`. Authentication or captcha with no available automatic
backend requires the user to recover the browser session.

## Autohome

- `list-brand-series`: list stable series identities and guide prices for a
  brand.
- `get-series-score`: retrieve series level/body style, owner score dimensions,
  reliability fields, and competitor identities.

## Decision context

- SAMR: `search-notices`, `get-notice` for official recall, penalty, quality,
  batch, attachment, and remediation evidence.
- Brave Search: `search` for discovery leads only. It uses the API when
  `BRAVE_SEARCH_API_KEY` is configured and an OpenCLI browser fallback
  otherwise.
- 36kr: `search-articles`, `get-article` for secondary industry/company event
  evidence.
- Xiaohongshu: `search-notes`, `get-note`, `get-comments` for a bounded,
  login-dependent community sample.
- Existing Dongchedi owner reviews in the car report are reused as corpus seed
  documents; do not fetch them a second time.

## Commands

```bash
sourceport doctor autohome --json
sourceport doctor dongchedi --json
sourceport doctor samr --json
sourceport doctor brave-search --json
sourceport doctor 36kr --json
sourceport doctor xiaohongshu --json
sourceport capabilities autohome
sourceport capabilities dongchedi
sourceport research-cars --input-file brief.json
sourceport research-cars --input-file brief.json --format md --report-file car-report.json
sourceport car-context collect --report-file car-report.json --format md --corpus-file context-corpus.json
sourceport context collect --input-file context-brief.json --format md --corpus-file context-corpus.json
sourceport context compile --corpus-file context-corpus.json --assessment-file assessment.json --format md --report-file context-report.json
```

Research and context commands exit with `0` for success, `1` for partial or
failed work, `2` for invalid input/evidence references, and `3` when all
required automatic acquisition paths are blocked by a human step. A nonzero
partial result may still contain useful evidence; inspect its sidecar.

SourcePort is live by default. Set freshness inside the brief only when the user
explicitly accepts cache reads. Do not silently enable stale data.
