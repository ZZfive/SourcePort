# SourcePort MVP Implementation Plan

Date: 2026-07-18

## 1. Objective

Implement the approved SourcePort MVP as a TypeScript/Node.js workspace that
provides stable, diagnosable, evidence-preserving access to specified websites.

The first validation slice will:

1. expose stable request/result envelopes and source capabilities;
2. execute operations through ordered backends;
3. return structured evidence, failures, warnings, and recovery actions;
4. detect unexpected source drift instead of returning silent empty results;
5. support Dongchedi source operations, including one verified exact-trim
   configuration flow;
6. support Autohome brand-series and series-score operations;
7. expose CLI discovery, execution, and doctor commands;
8. prove the core boundary through a separate car-research consumer skill.

MCP, write operations, broad crawling, and generalized recommendation remain
outside the MVP.

## 2. Approved Technical Decisions

- Runtime: Node.js 20 or newer.
- Language: TypeScript in strict mode.
- Package management: npm workspaces, avoiding an additional package-manager
  dependency.
- Unit and contract tests: Vitest.
- Runtime JSON Schema validation: Ajv in strict mode.
- CLI parsing: Node.js `util.parseArgs`; no CLI framework until command
  complexity proves one is needed.
- HTTP: Node.js built-in `fetch`.
- IDs and hashing: Node.js `crypto`.
- OpenCLI integration: external-process backend with structured JSON output,
  keeping SourcePort core independent from OpenCLI internals.
- Cache: local filesystem implementation behind an interface; no database in
  the MVP.
- Live tests: explicit opt-in scripts, excluded from default unit-test runs.
- Initial access mode: read-only.

If code is adapted from Apache-2.0 OpenCLI source adapters, preserve the
required license and attribution in `NOTICE` and relevant source comments.

## 3. Execution Covenant

### Deterministic work

Contracts, schemas, parsing, routing rules, cache semantics, redaction, and CLI
serialization are deterministic. Implement them test-first and verify them
locally before integration.

### Non-deterministic work

Live source accessibility, captcha, authentication, rate limits, and drift are
non-deterministic. For these tasks:

- use bounded live probes rather than repeated broad requests;
- preserve multiple access hypotheses only while they change the decision;
- recognize phase changes such as a public page becoming captcha-gated;
- prefer the path with the lowest expected time to a verified result, including
  recovery and maintenance;
- stop at explicit human verification instead of bypassing platform controls.

## 4. Branch and Commit Strategy

Implementation begins only after this plan is reviewed.

- Create branch: `codex/sourceport-mvp`.
- Keep each task independently testable.
- Commit after each task or tightly coupled task pair.
- Do not push, publish, or create a pull request without explicit user
  authorization.
- Never commit live credentials, cookies, tokens, unsanitized account data, or
  raw browser profiles.

## 5. Milestones

| Milestone | Result | Exit evidence |
|---|---|---|
| A. Executable core | Fake source runs through CLI | contract, registry, routing, CLI tests pass |
| B. First live vertical | Dongchedi `search-series` works through SourcePort | fixture tests plus bounded live smoke |
| C. Exact-trim acquisition | One exact trim configuration is verified | schema-valid result with source evidence |
| D. Multi-source diagnostics | Autohome and doctor work | two source packages plus health output |
| E. Consumer proof | Car-research skill composes SourcePort operations | end-to-end candidate comparison fixture |

Each milestone is a review checkpoint. A later milestone must not conceal a
failed exit criterion from an earlier one.

## 6. Task 1: Scaffold the Workspace

### Files

- Create `package.json` with npm workspaces for `packages/*` and `sources/*`.
- Create `tsconfig.base.json` with strict TypeScript settings.
- Create `.gitignore` for Node, local artifacts, caches, browser traces, and
  secrets.
- Create `packages/core/package.json` and `packages/core/tsconfig.json`.
- Create `packages/cli/package.json` and `packages/cli/tsconfig.json`.
- Create `packages/testing/package.json` and `packages/testing/tsconfig.json`.
- Create minimal `src/index.ts` entrypoints for each package.

### Required scripts

```json
{
  "scripts": {
    "build": "tsc -b",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:live": "vitest run --config vitest.live.config.ts"
  }
}
```

### Verification

1. Run `npm install`.
2. Run `npm run typecheck` and confirm exit code 0.
3. Run `npm test` and confirm the empty/minimal suite exits 0.
4. Run `npm run build` and confirm package outputs are generated only under
   ignored `dist/` directories.

### Commit

`chore: scaffold TypeScript workspace`

## 7. Task 2: Implement Core Contracts and Validation

### Tests first

Create:

- `packages/core/src/contracts.test.ts`
- `packages/core/src/schema-validation.test.ts`

The initial failing tests must cover:

- valid SourceRequest acceptance;
- rejection of unknown top-level request fields;
- missing source or operation rejection;
- operation-parameter validation through an injected JSON Schema;
- all SourceStatus values;
- SourceResult invariants:
  - success requires data, backend, retrieval time, and evidence;
  - blocked and failed require a failure;
  - stale requires freshness with `isLive: false`;
  - evidence IDs are unique;
- unsupported operation parameters are not silently dropped.

Run the focused tests and confirm they fail because implementation is absent.

### Implementation

Create:

- `packages/core/src/contracts.ts`
- `packages/core/src/schemas.ts`
- `packages/core/src/validate.ts`
- `packages/core/src/invariants.ts`

Use Ajv strict mode. Return typed validation failures rather than throwing raw
Ajv errors across the public boundary.

### Verification

- Run `npm test -- packages/core/src/contracts.test.ts`.
- Run `npm test -- packages/core/src/schema-validation.test.ts`.
- Run `npm run typecheck`.

### Commit

`feat(core): add request and result contracts`

## 8. Task 3: Add the Source Registry and Capability Discovery

### Tests first

Create `packages/core/src/registry.test.ts` covering:

- source registration;
- duplicate source rejection;
- operation registration and lookup;
- duplicate operation rejection;
- capability listing sorted deterministically;
- source-specific capability listing;
- immutable descriptors returned to callers;
- unsupported source and operation failures.

### Implementation

Create:

- `packages/core/src/registry.ts`
- `packages/core/src/adapter.ts`
- `packages/core/src/manifest.ts`

Define `SourceAdapter`, `SourceManifest`, and `OperationDescriptor` directly from
the approved design. Do not introduce a plugin loader yet; adapters are
registered explicitly in the MVP.

### Verification

- Run the focused registry tests.
- Run all core tests.
- Run typecheck.

### Commit

`feat(core): add source capability registry`

## 9. Task 4: Implement Evidence, Failures, and Redaction

### Tests first

Create:

- `packages/core/src/evidence.test.ts`
- `packages/core/src/failures.test.ts`
- `packages/core/src/redaction.test.ts`

Cover:

- deterministic evidence IDs from content hashes where applicable;
- retrieval timestamp normalization;
- provenance validation;
- warning-to-evidence references;
- finite failure-code validation;
- retryable versus non-retryable failure classification;
- recovery actions for login, human verification, backend switch, and retry;
- redaction of cookies, authorization headers, tokens, account IDs, and known
  sensitive keys;
- raw artifacts rejected when sanitization fails.

### Implementation

Create:

- `packages/core/src/evidence.ts`
- `packages/core/src/failures.ts`
- `packages/core/src/recovery.ts`
- `packages/core/src/redaction.ts`

Use built-in crypto and avoid a general logging framework in this task.

### Verification

- Run focused tests.
- Run the full core suite.
- Run typecheck.

### Commit

`feat(core): add evidence and recovery model`

## 10. Task 5: Implement Backend Contracts and Ordered Routing

### Tests first

Create:

- `packages/core/src/backends/router.test.ts`
- `packages/core/src/backends/public-http.test.ts`
- `packages/core/src/backends/opencli.test.ts`
- `packages/core/src/backends/manual-step.test.ts`

Use fake backends to cover:

- declared backend order;
- preferred-backend reordering without enabling undeclared backends;
- timeout and retry budgets;
- no retry for invalid requests or schema mismatch;
- retry for bounded network errors;
- fallback after captcha classification only when another declared backend can
  help;
- human verification recovery when automation must stop;
- preservation of every backend attempt in diagnostic metadata;
- circuit state preventing repeated known-bad attempts;
- one transient error not permanently opening a circuit.

### Implementation

Create:

- `packages/core/src/backends/types.ts`
- `packages/core/src/backends/router.ts`
- `packages/core/src/backends/public-http.ts`
- `packages/core/src/backends/opencli.ts`
- `packages/core/src/backends/manual-step.ts`
- `packages/core/src/circuit.ts`

The OpenCLI backend invokes `opencli` through `child_process.spawn`, requires
machine-readable JSON, captures stderr separately, and never interpolates user
input into a shell command.

### Verification

- Run focused backend tests.
- Run all core tests.
- Run typecheck and build.

### Commit

`feat(core): add bounded backend routing`

## 11. Task 6: Add Cache and Freshness Semantics

### Tests first

Create:

- `packages/core/src/cache/file-cache.test.ts`
- `packages/core/src/freshness.test.ts`

Cover:

- normalized cache keys;
- source, operation, parameters, schema version, and market participation in
  keys;
- live requests never silently using stale data;
- prefer-live fallback behavior;
- allow-stale maximum-age enforcement;
- retrieval time preserved from the cached result;
- blocked live retrieval not relabeling cached data as live;
- corrupted cache files rejected safely;
- atomic write behavior.

### Implementation

Create:

- `packages/core/src/cache/types.ts`
- `packages/core/src/cache/file-cache.ts`
- `packages/core/src/freshness.ts`

Store cache outside the repository by default under a platform-appropriate user
cache directory. Tests use temporary directories.

### Verification

- Run focused tests.
- Run all core tests.
- Confirm tests leave no files in the repository.

### Commit

`feat(core): add explicit freshness cache`

## 12. Task 7: Build the CLI Against a Fake Source

### Tests first

Create:

- `packages/cli/src/cli.test.ts`
- `packages/cli/src/output.test.ts`
- `packages/testing/src/fake-source.ts`

Cover:

- `sourceport sources`;
- `sourceport capabilities fake`;
- `sourceport run fake echo --input '{"value":"x"}'`;
- JSON output stability;
- non-zero exit codes for invalid requests and failed operations;
- blocked operations returning recovery actions;
- no ANSI formatting in JSON mode;
- stdout reserved for result data and stderr for diagnostics.

### Implementation

Create:

- `packages/cli/src/main.ts`
- `packages/cli/src/commands/sources.ts`
- `packages/cli/src/commands/capabilities.ts`
- `packages/cli/src/commands/run.ts`
- `packages/cli/src/output.ts`
- `packages/testing/src/fake-source.ts`

Use `util.parseArgs`. Add only the three commands required for Milestone A;
doctor is implemented after health contracts exist.

### Verification

- Run CLI tests.
- Build the workspace.
- Run each fake-source command against built output.
- Confirm Milestone A exit evidence.

### Commit

`feat(cli): expose source discovery and execution`

## 13. Task 8: Create the Adapter Contract Test Kit

### Tests first

Create `packages/testing/src/adapter-contract.test.ts` using deliberately broken
fake adapters. It must detect:

- mismatched manifest source names;
- missing operation schemas;
- duplicate operations;
- unexpected output keys;
- invalid stable identifiers;
- missing required non-empty fields;
- silent empty success;
- block/captcha HTML parsed as domain data;
- unsanitized fixture content;
- fixture schema-version mismatch.

### Implementation

Create:

- `packages/testing/src/adapter-contract.ts`
- `packages/testing/src/fixture.ts`
- `packages/testing/src/block-page-fixtures.ts`
- `packages/testing/src/index.ts`

The kit should accept source-specific invariants rather than impose a universal
domain schema.

### Verification

- Run testing-package tests.
- Run all workspace tests.
- Run typecheck.

### Commit

`feat(testing): add source adapter contract kit`

## 14. Task 9: Implement Dongchedi `search-series` as the First Vertical Slice

### Reconnaissance boundary

Before implementation, perform a bounded probe:

1. Recheck the current OpenCLI Dongchedi adapter and license.
2. Make at most three live requests across the public page and OpenCLI routes.
3. Classify each response as real data, captcha, block, network error, or drift.
4. Save only sanitized fixtures.
5. Write a strategy note in
   `sources/dongchedi/docs/search-series-strategy.md` describing the selected
   backend order and evidence.

### Tests first

Create:

- `sources/dongchedi/src/search-series.test.ts`
- `sources/dongchedi/src/classify-page.test.ts`
- sanitized fixtures under `sources/dongchedi/fixtures/search-series/`.

Cover:

- real series-card parsing;
- stable series identity;
- official and dealer price preservation without fabricated numeric values;
- result limit validation;
- captcha-page classification;
- empty fallback-shell classification;
- unexpected shape returning `source_drift`;
- evidence URL, backend, timestamp, and schema version.

Run tests and confirm the parser tests fail before implementation.

### Implementation

Create:

- `sources/dongchedi/package.json`
- `sources/dongchedi/src/adapter.ts`
- `sources/dongchedi/src/manifest.ts`
- `sources/dongchedi/src/search-series.ts`
- `sources/dongchedi/src/classify-page.ts`
- `sources/dongchedi/src/schemas/search-series.ts`

Register only `search-series` first. Do not create placeholder implementations
for later operations.

### Verification

- Run Dongchedi fixture tests.
- Run adapter contract tests.
- Run `sourceport capabilities dongchedi`.
- Run one bounded live smoke request.
- Confirm Milestone B exit evidence or report the exact blocking state.

### Commit

`feat(dongchedi): add search-series operation`

## 15. Task 10: Add Dongchedi Series, Trim, and Review Operations

Implement operations incrementally in this order:

1. `get-series`;
2. `list-trims`;
3. `get-owner-reviews`.

For each operation:

- create one or more sanitized real fixtures;
- write parser and contract tests first;
- declare operation-specific parameter and output schemas;
- validate exact stable identifiers;
- preserve price text and units as exposed by the source;
- add source URLs and evidence;
- classify missing data separately from source drift;
- run only one bounded live smoke after fixture tests pass.

### Files

- `sources/dongchedi/src/get-series.ts`
- `sources/dongchedi/src/list-trims.ts`
- `sources/dongchedi/src/get-owner-reviews.ts`
- corresponding schemas, tests, fixtures, and strategy notes.

### Verification

- Focused test for each operation.
- Dongchedi package test suite.
- Adapter contract suite.
- CLI invocation for each operation.

### Commits

- `feat(dongchedi): add series and trim operations`
- `feat(dongchedi): add owner review operation`

## 16. Task 11: Implement Exact-Trim Configuration with Fallback

This is the highest-risk MVP operation and must not be hidden inside the earlier
tasks.

### Bounded hypothesis set

Evaluate only these strategies:

1. server-rendered or bootstrap state containing exact-trim configuration;
2. existing OpenCLI exact-trim capability;
3. SourcePort-owned OpenCLI/browser adapter using visible DOM, page state, or
   browser-issued request;
4. explicit human verification followed by strategy 2 or 3.

Do not expand into signature cracking or captcha bypass.

### Reconnaissance evidence

Create `sources/dongchedi/docs/get-trim-configuration-strategy.md` containing:

- observed URL and source state;
- exact trim identity used for verification;
- authentication and captcha observations;
- tested backend hypotheses and outcomes;
- selected backend order;
- reasons rejected strategies were rejected;
- verified date.

### Tests first

Create:

- `sources/dongchedi/src/get-trim-configuration.test.ts`
- `sources/dongchedi/src/assistance-capabilities.test.ts`
- `sources/dongchedi/src/trim-identity.test.ts`
- sanitized configuration and block-page fixtures.

Cover:

- exact trim identity and year;
- claimed automation level separate from concrete capabilities;
- highway, urban, parking, active-safety, longitudinal, lateral, and monitoring
  capability groups;
- hardware, vendor/system name, version, optional package, subscription, OTA,
  market, and availability as independent optional evidence fields;
- no `hasADAS` universal boolean;
- HUAWEI ADS treated as a vendor system, not the generic category;
- unknown source fields preserved in sanitized raw evidence rather than mapped
  speculatively;
- captcha returning blocked plus human-verification recovery;
- source drift on unexpected configuration shape.

### Implementation

Create:

- `sources/dongchedi/src/get-trim-configuration.ts`
- `sources/dongchedi/src/assistance-capabilities.ts`
- `sources/dongchedi/src/schemas/get-trim-configuration.ts`
- any SourcePort-owned OpenCLI adapter under
  `sources/dongchedi/opencli/` if required.

### Live verification gate

The operation is not complete until one exact real trim:

- returns a schema-valid result;
- has stable trim identity;
- contains source evidence;
- is visibly checked against the source page;
- survives a second run or returns a correctly classified block;
- commits no sensitive session material.

If human verification is required, pause and ask the user to complete it. Do not
substitute fixture success for live completion.

### Commit

`feat(dongchedi): add exact trim configuration`

## 17. Task 12: Implement Autohome Source Operations

### Reconnaissance boundary

Recheck the current brand catalog and series-score pages with at most three live
requests. Record strategy notes and preserve licensing attribution if adapting
OpenCLI parsing logic.

### Tests first

Create fixtures and tests for:

- `list-brand-series`;
- `get-series-score`;
- brand-name validation;
- stable series IDs;
- guide-price preservation;
- aggregate and dimension score parsing;
- reliability and competitor fields when exposed;
- unexpected page shape;
- evidence and schema version.

### Implementation

Create:

- `sources/autohome/package.json`
- `sources/autohome/src/adapter.ts`
- `sources/autohome/src/manifest.ts`
- `sources/autohome/src/list-brand-series.ts`
- `sources/autohome/src/get-series-score.ts`
- corresponding schemas, fixtures, tests, and strategy notes.

### Verification

- Autohome fixture tests.
- Adapter contract tests.
- CLI capability and run commands.
- One bounded live smoke per operation.

### Commit

`feat(autohome): add public source operations`

## 18. Task 13: Add Health and Doctor

### Tests first

Create:

- `packages/core/src/health.test.ts`
- `packages/cli/src/commands/doctor.test.ts`

Cover:

- health per source, operation, and backend;
- healthy, degraded, blocked, drifted, and unconfigured states;
- OpenCLI missing versus installed-but-unavailable;
- captcha recognized as blocked rather than drift;
- unexpected source shape recognized as drift;
- circuit state included in diagnostics;
- doctor output in JSON and human-readable modes;
- doctor probes being bounded and read-only.

### Implementation

Create:

- `packages/core/src/health.ts`
- `packages/core/src/doctor.ts`
- `packages/cli/src/commands/doctor.ts`

Add:

```text
sourceport doctor
sourceport doctor dongchedi
```

### Verification

- Focused health and CLI tests.
- Run doctor with OpenCLI absent and confirm `unconfigured` is explicit.
- Run bounded live doctor for both sources.
- Confirm Milestone D exit evidence.

### Commit

`feat(cli): add source health diagnostics`

## 19. Task 14: Create the Car-Research Consumer Skill

The consumer must use SourcePort as an external capability and must not import
private core internals.

Before authoring, use the available skill-authoring guidance for the current
Codex environment.

### Files

- `skills/car-research/SKILL.md`
- `skills/car-research/references/sourceport-operations.md`
- `skills/car-research/references/driving-assistance-capabilities.md`
- `skills/car-research/examples/wuhan-15w-query.json`
- `skills/car-research/examples/candidate-result.json`

### Required behavior

- preserve original natural-language intent;
- compile it into evolving consumer-side constraints and preferences;
- discover candidates through source operations;
- request exact trim configuration only for bounded survivors;
- filter and compare outside SourcePort core;
- distinguish generic ADAS from vendor systems such as HUAWEI ADS;
- expose missing, unsupported, partial, stale, blocked, and conflicting evidence;
- never promote a claimed value to independently verified status;
- retain source URLs and retrieval time in the candidate table.

### Verification

- Validate the skill structure using the current skill-authoring workflow.
- Run a fixture-only scenario against fake/fixture SourcePort results.
- Run a bounded live scenario only after the underlying operations pass their
  live gates.
- Confirm no consumer-specific types were added to `packages/core`.
- Confirm Milestone E exit evidence.

### Commit

`feat(skill): add car research consumer`

## 20. Task 15: End-to-End Verification and Documentation

### End-to-end tests

Create `tests/e2e/car-research.test.ts` covering a fixture-driven flow:

1. discover candidate series;
2. resolve exact trims;
3. retrieve detailed configuration;
4. retrieve independent Autohome evidence;
5. preserve partial/conflict states;
6. produce a consumer candidate table with evidence links.

The test must prove that SourcePort core has no car criteria or ranking types.

### Documentation updates

- Update README with install, build, test, and CLI examples.
- Add `docs/adapter-authoring.md`.
- Add `docs/live-testing.md`.
- Add `docs/security-and-artifacts.md`.
- Add `NOTICE` when upstream code adaptation requires attribution.
- Document cache and fixture locations.
- Document human-verification pause/resume behavior.

### Final verification

Run fresh:

```bash
npm run typecheck
npm test
npm run build
npm run test:live -- --source dongchedi --bounded
npm run test:live -- --source autohome --bounded
sourceport doctor
```

Also verify:

- `git diff --check`;
- no secrets or unsanitized live artifacts;
- no unexpected files outside declared directories;
- every MVP operation has descriptor, schema, fixture, contract test, and
  strategy note;
- every completion claim maps to fresh command output.

### Commit

`docs: complete SourcePort MVP verification guide`

## 21. Stop Conditions and Escalation

Stop and report rather than guessing when:

- an exact source field cannot be decoded from evidence;
- the site requires captcha or login and no user-assisted session is available;
- a live result conflicts with fixtures and the cause is not established;
- three attempted fixes reveal new failures in different layers;
- implementing a source operation would require bypassing platform security;
- a proposed core abstraction exists only for a single speculative future use;
- credentials or private account data would need to be persisted.

After three failed fixes to the same architectural path, revisit the backend or
operation boundary with the user instead of attempting a fourth patch.

## 22. Plan Review Gate

No implementation task begins until the user reviews this plan. After approval,
start with Task 1 on `codex/sourceport-mvp` and execute milestone by milestone,
providing verification evidence at every checkpoint.
