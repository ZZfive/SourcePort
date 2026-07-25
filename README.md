# SourcePort

Stable, diagnosable, evidence-preserving access to specified web sources for AI
agents.

SourcePort turns source-specific retrieval paths—public HTTP, OpenCLI adapters,
logged-in browser sessions, and human-assisted recovery—into explicit source
operations with structured results and provenance.

## Boundary

SourcePort is an information-access layer. It is responsible for:

- source capability discovery;
- source-specific operations and versioned schemas;
- ordered backend routing and fallback;
- authentication, captcha, rate-limit, timeout, and drift diagnosis;
- structured data plus raw evidence and retrieval metadata;
- fixtures, contract tests, live probes, and recovery guidance.

SourcePort does not own cross-source recommendation or domain decisions. A
consumer skill may use SourcePort to research cars, housing, or another domain,
but filtering and ranking remain outside the core.

## First validation slice

The first consumer is a car-research skill backed by Dongchedi and Autohome
source adapters. It validates that SourcePort can retrieve exact series, trim,
configuration, price, and review evidence without turning the core into a car
decision engine.

## Current MVP status

- Core request/result contracts, evidence, failure taxonomy, redaction,
  capability registry, bounded routing, diagnostics, and circuit breaking are
  implemented.
- The CLI discovers and executes registered operations.
- Explicit `live`, `prefer-live`, and `allow-stale` freshness policies are
  implemented with evidence-preserving filesystem cache storage.
- `sourceport doctor` reports health per source, operation, and backend,
  including OpenCLI configuration, live probe results, and circuit state.
- Autohome `list-brand-series` and `get-series-score` have passed live
  end-to-end retrieval through SourcePort.
- Dongchedi `search-series`, `get-series`, `get-owner-reviews`, `list-trims`,
  and `get-trim-configuration` have passed live end-to-end retrieval through
  the logged-in OpenCLI Browser Bridge.
  Exact-trim results retain the full configuration sheet and separately model
  claimed assistance level, concrete capabilities, operating domains,
  perception hardware, optional equipment, and unknown system/vendor fields.
- `@sourceport/car-research`, `sourceport research-cars`, and the repository
  `research-cars` Skill implement a bounded, evidence-preserving consumer flow.
- A live Wuhan acceptance on 2026-07-25 validated all five requested seeds,
  scanned five series, retrieved three exact configurations, and matched four
  candidates exactly with Autohome. All on-road budget decisions correctly
  remained `unknown` because applicable Wuhan transaction, tax, insurance, and
  registration evidence was not supplied.

This MVP can be used for bounded car research through the CLI or Skill. It is
not a full-market catalog, a live dealer-quotation system, or an autonomous
purchase recommendation engine.

## Development

```bash
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
```

Discover and run operations through the built CLI:

```bash
node packages/cli/dist/main.js sources
node packages/cli/dist/main.js capabilities autohome
node packages/cli/dist/main.js run autohome list-brand-series \
  --input '{"brand":"宝马","limit":5}'
node packages/cli/dist/main.js run autohome get-series-score \
  --input '{"seriesId":"6548"}'
```

Requests are live by default and successful live results seed the cache without
changing the returned result. Cache reads are always explicit:

```bash
node packages/cli/dist/main.js run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness prefer-live --max-age-ms 86400000
node packages/cli/dist/main.js run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness allow-stale --max-age-ms 86400000
```

Cached results remain labeled `stale`, retain their original retrieval time and
evidence, and never hide a blocked live attempt. Cache files are stored outside
the repository in the platform user-cache directory. Set
`SOURCEPORT_CACHE_DIR` to use another location.

Run bounded, read-only live health probes with:

```bash
node packages/cli/dist/main.js doctor
node packages/cli/dist/main.js doctor autohome
node packages/cli/dist/main.js doctor dongchedi --json --timeout-ms 15000
```

Human-readable output is the default; `--json` emits the stable `DoctorReport`
shape. A healthy fallback makes an operation `degraded`, not blocked. Login or
captcha produces exit code `3` only when the operation has no usable automated
backend.

For Dongchedi's logged-in fallback:

1. Install and enable the
   [OpenCLI Chrome extension](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk).
2. Log in to Dongchedi in that Chrome profile and keep Chrome open.
3. Confirm the bridge with `node_modules/.bin/opencli doctor`.
4. Run:

```bash
node packages/cli/dist/main.js run dongchedi search-series \
  --input '{"keyword":"宝马X5","limit":5}'
node packages/cli/dist/main.js run dongchedi list-trims \
  --input '{"seriesId":"5273","status":"online"}'
node packages/cli/dist/main.js run dongchedi get-trim-configuration \
  --input '{"trimId":"255925"}'
```

The public backend is tried first. When it returns the observed login state,
SourcePort follows the explicit `switch_backend` recovery to the logged-in
browser backend. It does not copy cookies into the repository or bypass access
verification.

## Bounded car research

Build and expose the workspace CLI on `PATH`:

```bash
npm run build
npm link --workspace @sourceport/cli
command -v sourceport
sourceport doctor
```

Create a `CarResearchBrief` JSON file and run:

```bash
sourceport research-cars --input-file brief.json
sourceport research-cars --input-file brief.json --format md
```

`--input '<json>'` is also supported, but exactly one of `--input` and
`--input-file` is required. Research is live by default. A brief may explicitly
request `prefer-live` or `allow-stale` freshness; the consumer never enables a
cache read implicitly.

The brief preserves the original query, market, open-ended hard/preference/context
criteria, at most eight candidate seeds, optional dated cost evidence, and
bounded execution limits. Unknown criteria are returned in
`unsupportedCriteria`; missing prices, exact-trim configuration, and
cross-source identities remain `unknown`, `unmatched`, or `conflict` rather
than being inferred.

The repository-owned Skill is in [`skills/research-cars`](skills/research-cars/).
It translates natural language into the brief, runs doctor before research,
and explains the deterministic report without duplicating filtering, price, or
sorting logic.

## Design documents

See:

- [stable site acquisition design](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md);
- [MVP implementation plan](docs/superpowers/plans/2026-07-18-sourceport-mvp-implementation.md);
- [car-research consumer implementation and verification](docs/superpowers/plans/2026-07-25-car-research-consumer-implementation.md).
