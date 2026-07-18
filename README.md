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
- Autohome `list-brand-series` and `get-series-score` have passed live
  end-to-end retrieval through SourcePort.
- Dongchedi `search-series` parses real SSR data, classifies login/captcha/drift
  states, and has an OpenCLI Browser Bridge fallback. The public route is
  currently login-gated in the verified environment, so live success requires
  the browser extension and a logged-in Dongchedi session.
- Dongchedi exact-trim configuration and the car-research consumer are not yet
  complete.

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

For Dongchedi's logged-in fallback:

1. Install and enable the
   [OpenCLI Chrome extension](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk).
2. Log in to Dongchedi in that Chrome profile and keep Chrome open.
3. Confirm the bridge with `node_modules/.bin/opencli doctor`.
4. Run:

```bash
node packages/cli/dist/main.js run dongchedi search-series \
  --input '{"keyword":"宝马X5","limit":5}'
```

The public backend is tried first. When it returns the observed login state,
SourcePort follows the explicit `switch_backend` recovery to the logged-in
browser backend. It does not copy cookies into the repository or bypass access
verification.

## Design documents

See:

- [stable site acquisition design](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md);
- [MVP implementation plan](docs/superpowers/plans/2026-07-18-sourceport-mvp-implementation.md).
