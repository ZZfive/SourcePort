# SourcePort Stable Site Information Acquisition Design

Date: 2026-07-18

Status: Approved

## 1. Summary

SourcePort provides stable, diagnosable, evidence-preserving access to
information from specified websites for AI agents.

It does not attempt to become a general crawler or a domain decision engine.
Instead, each source exposes explicit, versioned operations such as
`dongchedi.search-series` or `autohome.get-series-score`. SourcePort selects an
available backend, executes the operation, detects blocks and schema drift, and
returns structured data together with evidence, freshness, warnings, and
recovery actions.

The first validation slice uses Dongchedi and Autohome. A separate
`car-research` skill consumes these operations to discover and compare cars.
That consumer proves the infrastructure without moving car-specific filtering
or ranking into the SourcePort core.

## 2. Problem

Agents can often search the open web but fail at the first step of practical
research: retrieving current, structured information from a known vertical
site. Failure modes include:

- pages that require a browser login session;
- captcha or device verification that appears only in some environments;
- public endpoints that work until the site changes its rendering or signing;
- internal APIs whose fields or authentication requirements drift;
- adapters documented as supported but not live in the current environment;
- silent empty results or field misalignment after a site redesign;
- results without source URLs, retrieval time, market, or verification state;
- agent workflows that cannot distinguish retryable failure from a hard block.

One-off scripts do not solve this reliably. The reusable need is a source access
contract, adapter runtime, backend routing, evidence envelope, health model, and
drift-testing discipline.

## 3. Goals

SourcePort must:

1. expose discoverable operations for a specified source;
2. keep the public request/result envelope stable while allowing each operation
   schema to evolve independently;
3. support ordered backend strategies such as public HTTP, OpenCLI, and a
   logged-in browser session;
4. distinguish success, partial data, stale data, authentication requirements,
   captcha, rate limits, source drift, and terminal failure;
5. preserve decision-relevant provenance and optionally sanitized raw evidence;
6. fail closed when an expected source shape changes;
7. provide structured recovery actions rather than opaque error strings;
8. test adapters against fixtures and opt-in live probes;
9. allow consumer skills to compose operations without embedding consumer logic
   in the core;
10. use TypeScript on Node.js 20 or newer and provide a CLI before adding MCP.

## 4. Non-goals

The SourcePort core will not:

- crawl an entire site or build a general search index;
- interpret broad natural-language buying or housing preferences;
- rank or recommend options across sources;
- define a universal schema for every vertical domain;
- bypass captcha, access controls, paywalls, or platform security mechanisms;
- guarantee that every live request succeeds despite external site controls;
- make MCP the initial runtime or deployment boundary;
- treat an upstream adapter's documentation as proof of current availability.

## 5. Definition of Stability

For SourcePort, stability does not mean that an external website can never
block a request. Stability means:

- operation names and result status semantics are predictable;
- the active backend and its evidence are visible;
- unexpected source shapes cannot silently become valid-looking output;
- authentication and human-verification requirements are explicit;
- fallback order is deterministic and observable;
- stale cached data is labeled with its retrieval time and policy;
- fixtures and live probes identify drift before consumer logic trusts it;
- a failed operation returns an actionable recovery path;
- no unsupported parameter or missing field is silently discarded.

## 6. Architectural Boundary

The system has three layers.

### 6.1 SourcePort core

The core owns:

- source and operation registration;
- request/result envelopes;
- schema/version validation;
- backend selection and fallback;
- execution budgets, timeout, and retry policy;
- evidence and artifact handling;
- health checks, circuit breaking, and diagnostics;
- cache/freshness policy;
- structured errors and recovery actions.

The core has no knowledge of car budgets, housing preferences, or recommendation
weights.

### 6.2 Source packages

Each source package owns:

- the operations supported by one website;
- operation-specific parameter and output schemas;
- mapping from source-specific fields to operation output;
- ordered backend candidates for each operation;
- source-specific login, block, and drift detection;
- sanitized fixtures and operation contract tests;
- source-specific health probes.

Source packages may expose canonical fields that are useful to consumers, but
must preserve source identity and evidence. They must not fabricate missing
values to satisfy a cross-source model.

### 6.3 Consumer skills and packages

Consumers own:

- natural-language interpretation;
- domain criteria and preferences;
- multi-operation and cross-source orchestration;
- filtering, comparison, ranking, and recommendation;
- explanation tailored to the user.

The first consumer is `car-research`. It may live in this repository for
coordinated development and end-to-end validation, but it depends on SourcePort
rather than extending the core contract with car-specific decisions.

## 7. Repository Structure

```text
SourcePort/
├── packages/
│   ├── core/                    # contracts, routing, evidence, status, cache
│   ├── cli/                     # sourceport sources/capabilities/run/doctor
│   └── testing/                 # adapter contract and fixture utilities
├── sources/
│   ├── dongchedi/
│   └── autohome/
├── skills/
│   └── car-research/            # first consumer and end-to-end validation
├── fixtures/                    # shared sanitized artifacts when appropriate
├── docs/
├── AGENTS.md
└── README.md
```

The implementation will use a Node.js workspace so packages can be tested and
versioned independently while sharing one development environment.

## 8. Public Contracts

### 8.1 Source request envelope

The request envelope is stable and intentionally thin. Operation parameters are
validated by the source operation's own versioned schema.

```ts
interface SourceRequest {
  requestId?: string;
  source: string;
  operation: string;
  parameters: unknown;
  operationSchemaVersion?: string;
  preferredBackends?: string[];
  freshness?: {
    mode: "live" | "prefer-live" | "allow-stale";
    maxAgeMs?: number;
  };
  evidence?: {
    includeRawArtifact?: boolean;
    minimum: "provenance" | "source-fragment" | "raw-artifact";
  };
  execution?: {
    timeoutMs?: number;
    retryBudget?: number;
    allowHumanAssistance?: boolean;
  };
}
```

Unknown top-level fields are rejected. Unknown operation parameters are handled
according to the operation schema and must never be silently ignored.

### 8.2 Source result envelope

```ts
type SourceStatus =
  | "success"
  | "partial"
  | "stale"
  | "blocked"
  | "failed";

type SourceFailureCode =
  | "invalid_request"
  | "unsupported_source"
  | "unsupported_operation"
  | "unsupported_parameter"
  | "auth_required"
  | "human_verification_required"
  | "rate_limited"
  | "access_blocked"
  | "network_error"
  | "timeout"
  | "source_drift"
  | "unexpected_source_shape"
  | "empty_source_result"
  | "evidence_requirement_unmet"
  | "backend_unavailable"
  | "internal_error";

interface SourceWarning {
  code: string;
  message: string;
  field?: string;
  evidenceIds?: string[];
}

interface SourceFailure {
  code: SourceFailureCode;
  message: string;
  stage: "validation" | "selection" | "transport" | "classification" | "parsing" | "evidence";
  retryable: boolean;
  backend?: string;
}

interface RecoveryAction {
  kind:
    | "retry"
    | "switch_backend"
    | "login"
    | "complete_human_verification"
    | "allow_stale_cache"
    | "reconfigure"
    | "report_source_drift";
  description: string;
  requiresUser: boolean;
  backend?: string;
  resumeToken?: string;
}

interface SourceResult<T> {
  requestId: string;
  source: string;
  operation: string;
  operationSchemaVersion: string;
  status: SourceStatus;
  data?: T;
  backend?: string;
  retrievedAt?: string;
  freshness?: {
    isLive: boolean;
    ageMs?: number;
  };
  evidence: EvidenceRecord[];
  warnings: SourceWarning[];
  failure?: SourceFailure;
  recoveryActions: RecoveryAction[];
}
```

`data` may be present for `partial` or `stale` results, but warnings and
freshness must make the limitation explicit. `blocked` and `failed` results do
not invent placeholder rows.

### 8.3 Capability descriptor

Each source advertises operations through machine-readable descriptors:

```ts
interface OperationDescriptor {
  source: string;
  operation: string;
  description: string;
  access: "read" | "write";
  schemaVersion: string;
  parametersSchema: object;
  outputSchema: object;
  backends: BackendDescriptor[];
  auth: "none" | "optional" | "required" | "human-assisted";
  freshnessClass: "live" | "volatile" | "periodic" | "historical";
}
```

The MVP only registers read operations.

## 9. Adapter and Backend Interfaces

### 9.1 Source adapter

```ts
interface SourceAdapter {
  manifest(): SourceManifest;
  operations(): OperationDescriptor[];
  execute(request: ValidatedSourceRequest, runtime: SourceRuntime):
    Promise<SourceResult<unknown>>;
  health(runtime: SourceRuntime): Promise<SourceHealth>;
}
```

Adapters validate parameters before network or browser activity. Parsing code
is separated from transport code so fixtures can test it without live access.

### 9.2 Backend

Backends implement transport and session behavior, not domain parsing. Initial
backend types are:

- `public-http`: unsigned HTTP/HTML/JSON retrieval;
- `opencli`: invoke a packaged or SourcePort-owned OpenCLI operation;
- `browser-session`: use an authenticated browser session and page runtime;
- `manual-step`: pause for a user to complete login or captcha, then resume.

The backend chain is declared per operation. There is no global assumption that
one transport works for all operations on the same site.

## 10. Execution Flow

1. Resolve `source.operation` from the registry.
2. Validate the request envelope and operation parameters.
3. Read operation health, circuit state, freshness requirement, and backend
   preferences.
4. Build the ordered backend candidate list.
5. Execute the cheapest viable candidate under the request budget.
6. Classify transport and source-state signals before parsing.
7. Parse and validate the result against the operation output schema.
8. Attach evidence, backend identity, retrieval time, warnings, and artifacts.
9. If the result is retryable, update the bounded hypothesis set and try the
   next backend when the expected value exceeds the remaining cost.
10. Return success, partial, stale, blocked, or failed with recovery actions.
11. Update health and drift observations without treating one transient failure
    as permanent source breakage.

This flow operationalizes the repository covenant: deterministic validation is
performed directly, while uncertain external-state decisions use bounded
evidence, phase-change recognition, and expected time to a reliable outcome.

## 11. Backend Selection and Fallback

Backend selection follows these rules:

1. Prefer a public, externally stable source when it returns the required data.
2. Prefer a visible UI or server-rendered state over an undocumented internal
   endpoint when the UI contract is more stable.
3. Use OpenCLI when it already provides a tested source operation or reliable
   logged-in-browser bridge.
4. Use a browser session when runtime execution, cookies, or UI interaction are
   required.
5. When captcha or access verification appears, stop automation and return a
   `human_verification_required` recovery action. Do not bypass it.
6. Use stale cache only when the request policy allows it and label it clearly.
7. Open the circuit after repeated drift or blocking signals; a doctor probe or
   expiry policy may close it again.

Retry decisions are bounded by request budgets and failure class. Invalid
parameters and deterministic schema mismatches are not retried.

## 12. Failure Taxonomy

`SourceFailure.code` uses the finite, machine-readable `SourceFailureCode`
taxonomy defined in the result contract:

- `invalid_request`
- `unsupported_source`
- `unsupported_operation`
- `unsupported_parameter`
- `auth_required`
- `human_verification_required`
- `rate_limited`
- `access_blocked`
- `network_error`
- `timeout`
- `source_drift`
- `unexpected_source_shape`
- `empty_source_result`
- `evidence_requirement_unmet`
- `backend_unavailable`
- `internal_error`

Each failure states whether it is retryable, whether another backend may help,
and which structured recovery actions are available.

## 13. Evidence and Provenance

Every decision-relevant field must be traceable to one or more evidence records:

```ts
interface EvidenceRecord {
  id: string;
  source: string;
  operation: string;
  backend: string;
  retrievedAt: string;
  sourceUrl?: string;
  sourceId?: string;
  market?: string;
  fragment?: unknown;
  artifactRef?: string;
  artifactHash?: string;
  verification: "claimed" | "source-verified" | "cross-verified";
}
```

Raw artifacts are opt-in, sanitized, content-addressed, and subject to retention
rules. Cookies, tokens, personal account data, and unnecessary user-private
content are never stored in fixtures.

## 14. Schema Evolution

SourcePort avoids a universal domain schema. Each operation owns an independent
semantic version:

- additive optional fields may use a compatible minor version;
- renamed, removed, or semantically changed fields require a major version;
- adapters may support multiple operation schema versions during migration;
- fixtures declare the schema version they validate;
- consumers request a version or accept the adapter's current compatible
  version;
- unknown fields are rejected or preserved according to the declared schema,
  never silently dropped.

The stable SourceRequest and SourceResult envelopes evolve more conservatively
than operation schemas.

## 15. Health, Doctor, and Drift Detection

The CLI exposes:

```text
sourceport sources
sourceport capabilities <source>
sourceport run <source> <operation> --input <json>
sourceport doctor
sourceport doctor <source>
```

Health is reported per source, operation, and backend rather than as a single
site boolean. States include `healthy`, `degraded`, `blocked`, `drifted`, and
`unconfigured`.

Drift detection combines:

- parser fixtures captured from sanitized real source responses;
- required identity and non-empty field checks;
- output schema validation;
- recognizable captcha/login/block-page detection;
- opt-in live smoke probes;
- comparison with the last known good source shape.

An unexpected shape fails closed with `source_drift`; it does not return an
empty successful result.

## 16. Cache and Freshness

Cache is evidence storage, not a hidden success path.

- cache keys include source, operation, normalized parameters, schema version,
  and market when relevant;
- every cached result retains retrieval time and evidence references;
- live, prefer-live, and allow-stale requests behave differently;
- stale fallback is returned only when policy permits it;
- volatile data such as local price uses stricter freshness than historical
  reviews;
- blocked live access does not relabel cached data as current.

## 17. Security and Platform Boundaries

The MVP is read-only.

- Credentials remain in the browser or upstream tool that owns them.
- SourcePort does not export browser cookies into fixtures or logs.
- Human verification pauses are explicit and user-controlled.
- SourcePort does not implement captcha bypass or signature cracking.
- Rate limits and randomized low-frequency pacing are source-operation policy.
- Artifacts are sanitized before persistent storage.
- Logs redact tokens, cookies, account identifiers, and private content by
  default.

## 18. First Validation Slice: Car Information Acquisition

The car slice validates SourcePort through real source operations. It does not
move car recommendation into the core.

### 18.1 Dongchedi operations

- `search-series`: keyword to stable series identifiers and price summaries;
- `get-series`: series overview and source identity;
- `list-trims`: exact model year and trim identifiers;
- `get-trim-configuration`: exact-trim configuration, including driving-
  assistance capabilities when the source exposes them;
- `get-owner-reviews`: bounded review evidence with source URLs.

The `get-trim-configuration` backend chain is public/server-rendered data when
available, then OpenCLI or browser session, then explicit human verification.
The operation is not considered live until an exact real trim is retrieved and
validated in the current environment.

### 18.2 Autohome operations

- `list-brand-series`: brand catalog to stable series identifiers;
- `get-series-score`: aggregate owner score, dimensions, reliability fields,
  and competitor references exposed by the source.

These operations provide independent source evidence and help validate that the
core supports more than one source without forcing identical schemas.

### 18.3 Driving-assistance data boundary

ADAS is the generic category of advanced driver-assistance systems. HUAWEI ADS
is one vendor product. SourcePort records source-exposed facts rather than a
single `hasADAS` flag.

When available, trim configuration evidence distinguishes:

- claimed automation level and responsibility boundary;
- operating domain such as highway, urban roads, and parking;
- longitudinal, lateral, navigation-assisted, active-safety, parking, and
  driver-monitoring functions;
- sensor hardware;
- vendor/system name and software version;
- exact trim, optional package, subscription, OTA, market, and availability;
- claimed, source-verified, or cross-verified evidence status.

The consumer skill decides how to interpret or weight these fields.

### 18.4 Car-research consumer

The consumer skill:

1. preserves the user's original natural-language intent;
2. compiles it into source-operation calls and domain predicates;
3. discovers candidates and requests exact trim evidence;
4. filters, compares, and explains results;
5. reports unsupported criteria and missing evidence;
6. never upgrades a SourcePort `partial`, `stale`, or `blocked` result to a
   verified fact.

Its domain criteria are intentionally outside the SourcePort core contract.

## 19. Testing Strategy

### Unit tests

- pure parsing and normalization against sanitized fixtures;
- request/result envelope validation;
- failure classification;
- evidence redaction and hashing;
- cache freshness behavior;
- backend selection and retry-budget behavior.

### Adapter contract tests

- manifest and operation descriptor validation;
- parameter rejection for unknown or invalid fields;
- exact output keys and types;
- stable identity fields;
- required non-empty values;
- fixture schema version checks;
- known block/login/captcha page classification;
- fail-closed behavior on malformed source shapes.

### Live smoke tests

Live tests are explicit and opt-in because they depend on network, login state,
and external platform controls. They verify:

- the operation still reaches the intended source state;
- one bounded result has valid stable identity;
- evidence URL and retrieval time are present;
- the adapter does not return a verification page as domain data;
- human assistance is requested rather than bypassed when required.

### End-to-end validation

The car-research consumer invokes Dongchedi and Autohome through the public
SourcePort contracts. This test proves the boundary: source acquisition is
reusable, while car filtering remains consumer logic.

## 20. MVP Acceptance Criteria

The design moves to implementation only with these acceptance targets:

1. The CLI lists registered sources and operation descriptors.
2. Requests and results validate through stable envelopes.
3. Dongchedi and Autohome packages expose the operations listed in Section 18.
4. Each operation has sanitized parser fixtures and adapter contract tests.
5. `dongchedi.get-trim-configuration` retrieves and validates one exact real
   trim through its declared backend chain; a captcha requires explicit human
   completion rather than bypass.
6. Results include backend, retrieval time, schema version, evidence, warnings,
   and recovery actions.
7. Unexpected source shapes fail closed as drift.
8. `sourceport doctor` reports health per source, operation, and backend.
9. A consumer car-research skill can create a candidate comparison without
   adding car-specific fields to SourcePort core contracts.
10. No credential, cookie, token, or private account data is committed.

## 21. Implementation Sequence Boundary

The implementation plan will be written only after this design is reviewed. It
will sequence work from contracts and tests to one vertical Dongchedi operation,
then routing/evidence/doctor, then the remaining car operations and consumer
skill. MCP remains outside the MVP and may be added later as another interface
over the same core.
