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

## Commands

```bash
sourceport doctor autohome --json
sourceport doctor dongchedi --json
sourceport capabilities autohome
sourceport capabilities dongchedi
sourceport research-cars --input-file brief.json
sourceport research-cars --input-file brief.json --format md
```

`research-cars` exits with `0` for success, `1` for partial or failed research,
`2` for invalid CLI/brief input, and `3` for blocked research requiring a human
step. A nonzero partial result may still contain useful candidates; inspect the
report rather than discarding it.

SourcePort is live by default. Set freshness inside the brief only when the user
explicitly accepts cache reads. Do not silently enable stale data.
