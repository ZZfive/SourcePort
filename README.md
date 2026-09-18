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
skills. Car research is the first validation consumer, and the repository now
also contains a deterministic property-research skeleton. The reusable
`decision-context` consumer adds bounded owner, event, recall, remediation, and
supply-chain evidence without leaking those concepts into core.

## Architecture

~~~text
Natural-language request
        |
        v
research-cars Codex Skill
        |
        +--> CarResearchBrief --> @sourceport/car-research
        |                         |
        |                         v
        |                    CarResearchReport
        |                         |
        +--> buildCarDecisionContextBrief
                                  |
                                  v
                       @sourceport/decision-context
                         | collect evidence corpus
                         | validate assessment
                         | derive advisory flags
                                  |
                                  v
                       DecisionContextReport

Both consumers use @sourceport/core
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
  +--> @sourceport/samr
  +--> @sourceport/brave-search
  +--> @sourceport/kr36
  +--> @sourceport/xiaohongshu
~~~

The repository currently contains:

| Package | Responsibility |
|---|---|
| <code>@sourceport/core</code> | Contracts, evidence, registry, routing, cache, failures, and doctor |
| <code>@sourceport/cli</code> | Source discovery, operation execution, doctor, and car-research CLI |
| <code>@sourceport/car-research</code> | Bounded cross-source car research and deterministic reporting |
| <code>@sourceport/property-research</code> | Bounded configurable new/resale property research, all-in costs, dual commutes, and verification gaps |
| <code>@sourceport/wuhan-housing</code> | Official Wuhan housing, presale, government, and provident-fund page acquisition and diagnosis |
| <code>@sourceport/decision-context</code> | Cross-domain evidence corpus, source admission, assessment validation, and advisory flags |
| <code>@sourceport/dongchedi</code> | Dongchedi search, series, review, trim, and configuration acquisition |
| <code>@sourceport/autohome</code> | Autohome brand catalog, score, reliability, and competitor acquisition |
| <code>@sourceport/samr</code> | Official notice search and detail acquisition |
| <code>@sourceport/brave-search</code> | API-or-browser discovery leads |
| <code>@sourceport/kr36</code> | 36kr article search and detail acquisition |
| <code>@sourceport/xiaohongshu</code> | Bounded note and top-level comment acquisition |
| <code>@sourceport/testing</code> | Test fixtures and helpers |
| <code>skills/research-cars</code> | Thin Codex orchestration skill for natural-language car research |
| <code>skills/research-property</code> | Thin Codex orchestration skill for natural-language property research |

## Current MVP status

The original car-research MVP and the general decision-context and car-context
MVP are on `main`. Implementation commit `a8d1c5c` is contained in the current
branch, and the installed personal `research-cars` Skill matches the repository
copy. Consult the
[implementation status](docs/superpowers/plans/2026-07-26-decision-context-car-mvp.md)
for the current test and point-in-time live-verification evidence.

External-site availability is time-specific. Run `sourceport doctor` before a
live task; package presence and fixture tests are not proof of a currently
usable browser session or public route.

Current branch verification on 2026-07-26:

- 40 test files and 171 tests passed; typecheck and build passed;
- Brave Search was healthy through the browser fallback with no API key;
- 36kr search and article detail were healthy;
- SAMR was degraded but available: browser search fallback and public notice
  detail were usable;
- Xiaohongshu was degraded and unavailable in the current browser session, with
  explicit human-verification/reconfiguration recovery;
- a bounded live collect retained SAMR, Brave, and 36kr evidence while
  Xiaohongshu was blocked, and deterministic compile derived an advisory
  `pause` for a directly applicable official P7+ recall.
- a separate fresh-task Skill forward validation kept two paper candidates in
  their original order and compiled a 32-document partial corpus. Because the
  selected SAMR detail body was unavailable in that run, the P7+ recall stayed
  `context-only`; an AION S battery event stayed `watch` because the selected
  trim and affected historical batch relationship was not established.

The different P7+ flags are intentional evidence-sensitive behavior: official
detail evidence can satisfy the `pause` gate, while discovery leads alone must
remain `unverified` and cannot do so.

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
| SAMR | <code>search-notices</code> | Search official recall, penalty, and quality/safety notices | Browser fallback available; static search drifted |
| SAMR | <code>get-notice</code> | Retrieve official body, publication date, scope, and attachments | Public HTTP available |
| Brave Search | <code>search</code> | Return discovery leads; never event confirmation by itself | Browser healthy; API optional |
| 36kr | <code>search-articles</code> | Search bounded industry/company event articles | OpenCLI browser healthy |
| 36kr | <code>get-article</code> | Retrieve one supported article body | OpenCLI browser healthy |
| Xiaohongshu | <code>search-notes</code> | Search a bounded community sample | Current session unavailable; recovery required |
| Xiaohongshu | <code>get-note</code> | Retrieve one note | Requires a valid signed note URL/session |
| Xiaohongshu | <code>get-comments</code> | Retrieve bounded top-level comments | Requires a valid signed note URL/session |
| Wuhan official housing | <code>get-official-page</code> | Retrieve allowlisted housing, presale, government, and provident-fund pages | Public HTTP healthy; browser fallback diagnosed explicitly |
| Wuhan listing leads | <code>search-listings</code> / <code>get-listing</code> | Retrieve Wuhan new and resale listing leads | <code>search-listings</code> public HTTP healthy; <code>get-listing</code> currently drifted; results are lead-only |

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
  for browser-backed operations;
- logged-in Dongchedi and Xiaohongshu sessions when those operations require
  authentication;
- optional `BRAVE_SEARCH_API_KEY`; without it Brave uses the registered
  OpenCLI browser backend.

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
sourceport capabilities samr
sourceport capabilities brave-search
sourceport capabilities 36kr
sourceport capabilities xiaohongshu
~~~

Run bounded, read-only live probes:

~~~bash
sourceport doctor
sourceport doctor autohome
sourceport doctor dongchedi
sourceport doctor samr
sourceport doctor brave-search
sourceport doctor 36kr
sourceport doctor xiaohongshu
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

Decision-context sources:

~~~bash
sourceport run samr search-notices \
  --input '{"query":"某汽车 召回 质量","categories":["recall","quality-safety"],"limit":5}'

sourceport run brave-search search \
  --input '{"query":"某汽车 召回 供应链","limit":5,"country":"CN","language":"zh-hans"}'

sourceport run 36kr search-articles \
  --input '{"query":"某汽车公司 召回 处罚","limit":5}'

sourceport run xiaohongshu search-notes \
  --input '{"query":"某车型 真实车主 用车","limit":2}'
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

Research cars for my selected city and on-road budget. Ask for missing
preferences, charging access, and required capabilities.
~~~

The Skill runs the paper-data research once with a complete JSON sidecar, then
collects decision context only for the final candidates. It uses the compact
corpus to prepare a cited assessment and lets the deterministic compiler enforce
source admission, owner-signal thresholds, supplier applicability, and advisory
flags.

The discovery ledger includes relevant brand catalogues and dated release
leads supplied by the consumer. It prioritizes explicit series seeds and leads,
then admits catalogue cars in rounds across brands. This remains bounded
coverage, not a whole-market search. Configuration queries share one global
attempt budget and run in rounds across series; failed attempts count.

`discoveredSeries` records coverage gaps, `evaluatedTrims` retains every listed
trim and its configuration status, and `allCandidates` retains representatives
before the five-candidate display cap. Selection follows evaluated criteria,
including per-capability evidence, rather than the presence of an ADAS object.
Reference vehicle prices and evidenced on-road totals are separate. Delivery
deadlines require current, local, exact-trim commitments; launch status is
insufficient. Unknown hard conditions remain `needs-verification`.

Defaults and maxima, lead attribution, and delivery inputs are documented in
[criteria and evidence](skills/research-cars/references/criteria-and-evidence.md).
Follow-up research is appropriate when named cars or decisive trims remain
unexamined; format conversion does not require another live pass.

### CLI use

Create <code>brief.json</code>:

~~~json
{
  "query": "示例购车需求（请按实际输入填写）",
  "market": {
    "country": "CN",
    "city": "示例城市",
    "currency": "CNY"
  },
  "criteria": [
    {
      "key": "budget.onRoad.maxCny",
      "label": "示例落地预算",
      "kind": "hard",
      "priority": 100,
      "requirement": { "maxCny": 240000 }
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
    "exactConfigurations": 10,
    "finalCandidates": 5,
    "ownerReviewsPerSeries": 3
  }
}
~~~

Run one live paper-data research and keep its complete sidecar:

~~~bash
sourceport research-cars --input-file brief.json --format md \
  --report-file car-report.json
~~~

### Property research

`@sourceport/property-research` reads city, all-in budget, layout preferences,
commute destinations, and financing assumptions from the supplied brief.
There is no default personal profile. The checked-in example is synthetic;
replace it with a private input file before doing real research.

~~~bash
sourceport research-property \
  --input-file examples/property-research/brief.example.json \
  --candidates-file examples/property-research/normalized-candidates.json \
  --format md \
  --report-file property-report.json
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

### Decision context workflow

The car convenience command builds a generic `DecisionContextBrief` from at
most five final, non-rejected candidates. It creates series, exact-trim, and
manufacturer subjects; it adds battery, cell, or driving-assistance suppliers
only when exact-configuration evidence names them. Existing Dongchedi owner
reviews become seed documents and are not fetched again.

~~~bash
sourceport car-context collect --report-file car-report.json --format md \
  --corpus-file context-corpus.json

sourceport context compile --corpus-file context-corpus.json \
  --assessment-file assessment.json --format md \
  --report-file context-report.json
~~~

`context collect` is the domain-neutral entry point for future consumers:

~~~bash
sourceport context collect --input-file context-brief.json --format md \
  --corpus-file context-corpus.json
~~~

Collection only retrieves, normalizes, deduplicates, and records evidence. It
does not assign severity or recommendations. The assessment must cite corpus
document/evidence IDs; compilation rejects invalid references and unsupported
claims.

Source admission and flags:

- Brave snippets are discovery leads and cannot confirm events alone;
- official evidence can confirm recalls, penalties, batches, and remediation;
- `repeated` owner signals need three distinct items or authors;
  `cross-source` also needs two source families;
- supplier risk is direct only with an evidenced exact series/trim/batch
  relation;
- unknown dates remain `date unknown`, not “recent”;
- `context-only`, `watch`, `verify-before-buy`, and `pause` are advisory and do
  not change car eligibility or ordering;
- `pause` requires direct high/critical unresolved scope with official or
  independently cross-verified support.

Default context windows are 365 days for recent events and 1095 days for
recalls or recurring quality history. Hard limits are 24 source queries, 8
results per query, 20 documents per subject, 80 documents total, 30 detail
calls, and 10 top-level comments per note. Xiaohongshu is additionally limited
to two notes per candidate.

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

The context commands use the same convention. Exit `2` also covers invalid
corpus/assessment references. Exit `3` means all required automatic context
paths are blocked by a human step; optional-source failures produce a partial
corpus instead.

## Acceptance coverage

Synthetic fixtures exercise bounded discovery, exact-trim matching, and unknown
cost evidence. Private live-run briefs and reports are excluded from version control.

## Product boundary

SourcePort can now be used directly for:

- bounded car-series discovery from declared seed hypotheses;
- exact trim and configuration retrieval;
- driving-assistance comparison;
- owner-review retrieval;
- Autohome cross-checking;
- deterministic condition evaluation and candidate tables;
- bounded official-notice, media, discovery, and community evidence collection;
- deterministic source admission, recurrence checks, supplier applicability,
  conflicts, unknowns, and advisory context flags;
- evidence-preserving reports with explicit unknowns and recovery actions.

It is not:

- a full-market vehicle database or exhaustive catalog;
- a live local dealer-quotation, inventory, or delivery-time system;
- a guarantee that a vehicle can be purchased within a stated on-road budget;
- an autonomous purchase decision or transaction engine;
- an arbitrary-URL public web reader or general crawler;
- a housing decision-context domain pack (the generic contracts are reusable,
  but housing queries and interpretation are not implemented in this MVP);
- an adapter for Yiche, 58.com, Beike, Ziroom, or other not-yet registered
  sources.

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
sourceport doctor samr --json
sourceport doctor brave-search --json
sourceport doctor 36kr --json
sourceport doctor xiaohongshu --json
~~~

Do not commit caches, cookies, tokens, browser profiles, captcha artifacts, or
private raw pages.

## Documentation

- [Agent covenant](AGENTS.md)
- [Stable site acquisition design](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md)
- [MVP implementation plan](docs/superpowers/plans/2026-07-18-sourceport-mvp-implementation.md)
- [Car-research implementation and verification](docs/superpowers/plans/2026-07-25-car-research-consumer-implementation.md)
- [Decision-context design](docs/superpowers/specs/2026-07-26-decision-context-design.md)
- [Decision-context car MVP implementation status](docs/superpowers/plans/2026-07-26-decision-context-car-mvp.md)
- [research-cars Skill](skills/research-cars/SKILL.md)
- [简体中文 README](README_zh.md)

Private inputs belong in `private/` or `*.local.json`; reports belong in `reports/`. These paths are ignored by Git. Numeric examples are synthetic, not defaults. Public adapter names and official URLs identify supported sources, not a buyer profile.
