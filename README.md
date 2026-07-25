# SourcePort

English | [简体中文](README_zh.md)

Stable, diagnosable, evidence-preserving access to specified web sources for AI
agents.

SourcePort turns source-specific retrieval paths—public HTTP, OpenCLI adapters,
logged-in browser sessions, and human-assisted recovery—into explicit,
versioned source operations with structured results, provenance, health
diagnostics, and recovery guidance.

## What SourcePort is

SourcePort is an information-access layer. It owns:

- source capability discovery and versioned operation schemas;
- validated request/result envelopes;
- ordered backend routing, fallback, timeouts, retries, and circuit breaking;
- authentication, captcha, rate-limit, network, empty-result, and source-drift
  diagnosis;
- structured data plus source URL or ID, retrieval time, backend, and evidence;
- explicit freshness policies and an evidence-preserving filesystem cache;
- fixtures, contract tests, bounded live probes, and recovery actions.

SourcePort does not make domain decisions in its core. Cross-source filtering,
ranking, recommendation, and decision-making belong to consumer packages or
skills. The first validation consumer is bounded car research using Dongchedi
and Autohome.

## Architecture

~~~text
Natural-language request
        |
        v
research-cars Codex Skill
        |
        v
CarResearchBrief
        |
        v
@sourceport/car-research
        |
        v
@sourceport/core
  | registry and versioned contracts
  | router, fallback, circuit breaker
  | freshness cache and doctor
  |
  +--> @sourceport/dongchedi
  |      +--> public HTTP
  |      +--> logged-in OpenCLI Browser Bridge
  |      +--> manual recovery guidance
  |
  +--> @sourceport/autohome
         +--> public HTTP
         +--> manual recovery guidance
        |
        v
CarResearchReport: JSON or Markdown
~~~

The repository currently contains:

| Package | Responsibility |
|---|---|
| <code>@sourceport/core</code> | Contracts, evidence, registry, routing, cache, failures, and doctor |
| <code>@sourceport/cli</code> | Source discovery, operation execution, doctor, and car-research CLI |
| <code>@sourceport/car-research</code> | Bounded cross-source car research and deterministic reporting |
| <code>@sourceport/dongchedi</code> | Dongchedi search, series, review, trim, and configuration acquisition |
| <code>@sourceport/autohome</code> | Autohome brand catalog, score, reliability, and competitor acquisition |
| <code>@sourceport/testing</code> | Test fixtures and helpers |
| <code>skills/research-cars</code> | Thin Codex orchestration skill for natural-language car research |

## Current MVP status

The car-research functional MVP is complete. It has been merged into and pushed
to <code>main</code>, the repository Skill has been installed and forward
tested, and the full flow can be used through either the CLI or the Codex Skill.

Functional baseline verified on 2026-07-25 before this documentation
closeout:

- the implementation baseline on <code>main</code> and
  <code>origin/main</code> was <code>a2b1706</code>, with no uncommitted
  implementation files;
- 31 test files and 143 tests passed;
- <code>npm run typecheck</code> and <code>npm run build</code> passed;
- the linked CLI was available as <code>/opt/homebrew/bin/sourceport</code>;
- the installed <code>research-cars</code> Skill matched the repository copy;
- OpenCLI 1.8.6 reported a running daemon and a connected Chrome extension;
- Autohome was <code>healthy, available=true</code>;
- Dongchedi was <code>degraded, available=true</code>: several public entry
  points required authentication, while the logged-in browser fallback kept
  all five registered operations usable.

This is a point-in-time verification, not a permanent promise about external
sites. Run <code>sourceport doctor</code> before a live research task.

### Supported source operations

| Source | Operation | Purpose | Latest verified route |
|---|---|---|---|
| Autohome | <code>list-brand-series</code> | List stable series IDs and guide prices for a brand | Public HTTP, healthy |
| Autohome | <code>get-series-score</code> | Get owner score, dimensions, reliability, and competitors | Public HTTP, healthy |
| Dongchedi | <code>search-series</code> | Search car series by keyword | Logged-in browser fallback available |
| Dongchedi | <code>get-series</code> | Get series identity, prices, rating, ranks, and trim count | Logged-in browser fallback available |
| Dongchedi | <code>get-owner-reviews</code> | Get a bounded set of owner reviews and evidence URLs | Logged-in browser fallback available |
| Dongchedi | <code>list-trims</code> | List exact on-sale or discontinued trims | Logged-in browser, healthy |
| Dongchedi | <code>get-trim-configuration</code> | Get the full exact-trim configuration and driving-assistance evidence | Logged-in browser, healthy |

Exact-trim driving-assistance output keeps claimed automation level, concrete
capabilities, operating domains, perception hardware, system/version,
standard/optional availability, packages, subscriptions, OTA conditions, and
market applicability separate. It does not use a universal
<code>hasADAS</code> boolean or equate generic ADAS with HUAWEI ADS.

## Quick start

### Requirements

- Node.js 20 or later;
- npm;
- Chrome plus the
  [OpenCLI extension](https://chromewebstore.google.com/detail/opencli/ildkmabpimmkaediidaifkhjpohdnifk)
  for Dongchedi browser-backed operations;
- a logged-in Dongchedi session when the public route requires authentication.

The packages are currently private workspace packages rather than a public npm
release. Build and link the CLI from this repository:

~~~bash
npm install --ignore-scripts
npm run typecheck
npm test
npm run build
npm link --workspace @sourceport/cli
command -v sourceport
~~~

For Dongchedi, keep the relevant Chrome profile open and verify the bridge:

~~~bash
node_modules/.bin/opencli doctor
sourceport doctor dongchedi
~~~

SourcePort does not copy cookies into the repository or bypass authentication,
captcha, access verification, or rate limits. If the browser session is no
longer usable, complete the reported login or verification action and rerun the
doctor or operation.

## Discover and diagnose capabilities

List registered sources:

~~~bash
sourceport sources
~~~

Inspect the authoritative parameter and output schemas:

~~~bash
sourceport capabilities autohome
sourceport capabilities dongchedi
~~~

Run bounded, read-only live probes:

~~~bash
sourceport doctor
sourceport doctor autohome
sourceport doctor dongchedi
sourceport doctor dongchedi --json --timeout-ms 15000
~~~

Human-readable output is the default. <code>--json</code> emits the stable
<code>DoctorReport</code> shape.

Doctor states:

| State | Meaning |
|---|---|
| <code>healthy</code> | The preferred automatic backend is usable |
| <code>degraded</code> | A fallback or partial path remains usable, or a temporary failure was observed |
| <code>blocked</code> | Authentication, captcha, or access restriction leaves no usable automatic path |
| <code>drifted</code> | The source shape no longer satisfies the expected contract |
| <code>unconfigured</code> | A required local dependency, daemon, or browser extension is unavailable |

Doctor exit codes:

| Exit code | Meaning |
|---:|---|
| 0 | All selected sources are healthy |
| 1 | At least one source is degraded, drifted, unconfigured, or internally failed |
| 2 | Invalid CLI input or unknown source |
| 3 | A source or operation is blocked with no usable automatic route |

A blocked primary backend with a healthy fallback is aggregated as
<code>degraded, available=true</code>, not as an unavailable source.

## Run individual source operations

Autohome:

~~~bash
sourceport run autohome list-brand-series \
  --input '{"brand":"宝马","limit":5}'

sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}'
~~~

Dongchedi:

~~~bash
sourceport run dongchedi search-series \
  --input '{"keyword":"宝马X5","limit":5}'

sourceport run dongchedi get-series \
  --input '{"seriesId":"5273"}'

sourceport run dongchedi get-owner-reviews \
  --input '{"seriesId":"5273","limit":5}'

sourceport run dongchedi list-trims \
  --input '{"seriesId":"5273","status":"online"}'

sourceport run dongchedi get-trim-configuration \
  --input '{"trimId":"255925"}'
~~~

Each result preserves its source, operation, schema version, backend, status,
retrieval time, structured data, evidence, warnings, failure details, attempts,
and recovery actions.

## Freshness and cache semantics

Requests are live by default. A successful or partial live result can seed the
cache, but SourcePort never reads the cache unless the caller explicitly
allows it.

Live only:

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}'
~~~

Try live first and fall back to an age-valid cache only when live acquisition
is blocked or fails:

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness prefer-live \
  --max-age-ms 86400000
~~~

Use an age-valid cache first and perform live acquisition only when the cache is
missing, expired, corrupt, or contract-invalid:

~~~bash
sourceport run autohome get-series-score \
  --input '{"seriesId":"6548"}' \
  --freshness allow-stale \
  --max-age-ms 86400000
~~~

Cached results remain labeled <code>stale</code>, use
<code>backend=cache</code>, retain the original retrieval time and evidence,
and never hide a failed live attempt. Set <code>SOURCEPORT_CACHE_DIR</code> to
override the platform user-cache directory.

## Bounded car research

### Simplest use: the Codex Skill

Install or expose the repository Skill as <code>research-cars</code>, then ask
Codex explicitly:

~~~text
Use $research-cars.

I am buying a first car in Wuhan. The on-road price must not exceed CNY
150,000. I do not have a private charger. Driving assistance is important,
especially ACC, lane centering, automatic parking, and highway navigation.
Prefer an SUV, but a sedan is acceptable. Return no more than five candidates
and list everything that still needs verification.
~~~

The Skill checks the CLI and both source doctors, translates the request into a
bounded <code>CarResearchBrief</code>, executes one primary Markdown or JSON
research run, and explains the deterministic report without replacing unknowns
or conflicts with guesses.

### CLI use

Create <code>brief.json</code>:

~~~json
{
  "query": "武汉购车，落地价不超过15万元，没有私人充电桩，辅助驾驶优先，SUV优先但轿车也可以",
  "market": {
    "country": "CN",
    "city": "武汉",
    "currency": "CNY"
  },
  "criteria": [
    {
      "key": "budget.onRoad.maxCny",
      "label": "武汉落地价不超过15万元",
      "kind": "hard",
      "priority": 100,
      "requirement": { "maxCny": 150000 }
    },
    {
      "key": "drivingAssistance.capabilities",
      "label": "辅助驾驶能力优先",
      "kind": "preference",
      "priority": 90,
      "requirement": ["自适应巡航", "车道居中", "自动泊车", "高速领航辅助"]
    },
    {
      "key": "bodyStyle.preferred",
      "label": "SUV优先",
      "kind": "preference",
      "priority": 80,
      "requirement": ["SUV"]
    },
    {
      "key": "ownership.privateCharger",
      "label": "没有私人充电桩",
      "kind": "context",
      "priority": 70,
      "requirement": false
    }
  ],
  "seeds": [
    { "kind": "series", "name": "星越L", "brand": "吉利汽车" },
    { "kind": "series", "name": "博越L", "brand": "吉利汽车" },
    { "kind": "series", "name": "星瑞", "brand": "吉利汽车" },
    { "kind": "series", "name": "风云T9", "brand": "奇瑞汽车" },
    { "kind": "series", "name": "长安启源Q05", "brand": "长安启源" }
  ],
  "limits": {
    "initialSeeds": 5,
    "expandedSeries": 8,
    "scannedSeries": 5,
    "exactConfigurations": 3,
    "finalCandidates": 5,
    "ownerReviewsPerSeries": 3
  }
}
~~~

Run one primary output format:

~~~bash
sourceport research-cars --input-file brief.json --format md
sourceport research-cars --input-file brief.json --format json
~~~

Inline JSON is also supported:

~~~bash
sourceport research-cars --input '<json>' --format md
~~~

Exactly one of <code>--input</code> and <code>--input-file</code> is required.
Research is live by default. A brief may explicitly include:

~~~json
{
  "freshness": {
    "mode": "prefer-live",
    "maxAgeMs": 86400000
  }
}
~~~

### Criteria and decision semantics

Criteria use an open contract:

~~~text
key
label
kind: hard | preference | context
priority
requirement
~~~

The current evaluator registry understands:

| Criterion key | Meaning |
|---|---|
| <code>budget.onRoad.maxCny</code> | Maximum evidenced on-road cost |
| <code>bodyStyle.preferred</code> | Preferred body style |
| <code>drivingAssistance.capabilities</code> | Required or preferred exact-trim capabilities |
| <code>drivingAssistance.claimedLevel.min</code> | Minimum claimed assistance level |
| <code>ownership.privateCharger</code> | Private-charger usage context |

Unknown keys are preserved in <code>unsupportedCriteria</code>; they are never
silently ignored.

Each criterion result is one of:

~~~text
pass | fail | unknown | conflict | unsupported
~~~

Candidate eligibility is:

| Eligibility | Meaning |
|---|---|
| <code>eligible</code> | All hard conditions are evidenced as satisfied |
| <code>needs-verification</code> | At least one hard condition is unknown, conflicting, or unsupported |
| <code>rejected</code> | At least one hard condition has an evidence-backed failure |

Only an evidence-backed hard-condition failure rejects a candidate. A missing
field is not interpreted as unsupported functionality, and no-private-charger
context does not automatically exclude battery-electric, plug-in hybrid, or
range-extended vehicles.

### Bounded coverage

The hard maximums are:

| Limit | Maximum |
|---|---:|
| Initial seeds | 8 |
| Expanded series | 12 |
| Series scanned for trims | 8 |
| Exact trim configurations | 6 |
| Final candidates | 5 |
| Owner reviews per series | 5 |

Seeds are hypotheses until validated by SourcePort. Cross-source matching uses
stable IDs within a source and exact normalized brand/name matching across
sources. Ambiguous identities remain <code>unmatched</code> or
<code>conflict</code>; the engine does not hide uncertainty behind fuzzy
matching.

### On-road cost

Source reference prices are not treated as local transaction prices. A known
on-road cost requires dated, applicable evidence for:

- vehicle transaction price;
- purchase tax;
- insurance;
- registration;
- any other mandatory cost.

Without those components, the budget result remains <code>unknown</code> and
the candidate remains <code>needs-verification</code>. This is expected
behavior, not a retrieval failure.

### Research output and exit codes

<code>CarResearchReport</code> contains:

- bounded coverage and execution limits;
- accepted and rejected candidates;
- exact trims;
- criterion and driving-assistance matrices;
- on-road cost status and missing components;
- cross-source match status;
- unsupported criteria;
- evidence, warnings, recovery actions, and coverage limitations.

Research CLI exit codes:

| Exit code | Meaning |
|---:|---|
| 0 | Report status is <code>success</code> |
| 1 | Report status is <code>partial</code> or <code>failed</code> |
| 2 | Invalid CLI input or invalid <code>CarResearchBrief</code> |
| 3 | Required acquisition was blocked by login or captcha |

## Verified Wuhan acceptance

The bounded Wuhan acceptance on 2026-07-25 used the decision boundary:

> On-road price no higher than CNY 150,000, no private charger, driving
> assistance preferred, SUV preferred but sedan acceptable.

It validated all five requested seeds, expanded to eight series, scanned five
series, retrieved three exact configurations, returned five candidates, and
matched four candidates exactly with Autohome.

All Wuhan on-road budget decisions correctly remained <code>unknown</code>
because applicable transaction, tax, insurance, and registration evidence was
not supplied. The result demonstrated auditable bounded research, not a Wuhan
dealer quotation or a full-market search.

## Product boundary

SourcePort can now be used directly for:

- bounded car-series discovery from declared seed hypotheses;
- exact trim and configuration retrieval;
- driving-assistance comparison;
- owner-review retrieval;
- Autohome cross-checking;
- deterministic condition evaluation and candidate tables;
- evidence-preserving reports with explicit unknowns and recovery actions.

It is not:

- a full-market vehicle database or exhaustive catalog;
- a live Wuhan dealer-quotation, inventory, or delivery-time system;
- a guarantee that a vehicle can be purchased within a stated on-road budget;
- an autonomous purchase decision or transaction engine;
- an adapter for Yiche, 58.com, Xiaohongshu, Beike, Ziroom, or other not-yet
  registered sources.

The highest-value next capability for car research is applicable transaction
evidence: local dealer prices, tax rules, insurance, registration, mandatory
fees, inventory, and delivery conditions.

## Development and verification

~~~bash
npm run typecheck
npm test
npm run build
~~~

Live checks:

~~~bash
sourceport doctor autohome --json
sourceport doctor dongchedi --json
~~~

Do not commit caches, cookies, tokens, browser profiles, captcha artifacts, or
private raw pages.

## Documentation

- [Agent covenant](AGENTS.md)
- [Stable site acquisition design](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md)
- [MVP implementation plan](docs/superpowers/plans/2026-07-18-sourceport-mvp-implementation.md)
- [Car-research implementation and verification](docs/superpowers/plans/2026-07-25-car-research-consumer-implementation.md)
- [research-cars Skill](skills/research-cars/SKILL.md)
- [简体中文 README](README_zh.md)
