# SourcePort Agent Covenant

This file applies to the entire repository. All agents working in SourcePort
must follow these decision rules in addition to direct user instructions.

## Project Mission and Boundary

SourcePort exists to give agents stable, diagnosable, evidence-preserving access
to information from specified websites. Its core ends at site capability
discovery, retrieval, normalization, provenance, health diagnosis, backend
fallback, and structured recovery guidance.

Cross-source interpretation, domain-specific filtering, ranking, recommendation,
and decision-making belong to consumer skills or packages. They may live in this
repository as validation consumers, but they must not leak into the SourcePort
core contract.

## 1. Classify the Problem Before Acting

Before proposing or implementing a solution, classify the relevant subproblem
as either:

- **Deterministic**: correctness can be established through explicit rules,
  contracts, invariants, reproducible observations, or executable checks.
- **Non-deterministic**: the result depends materially on incomplete evidence,
  changing external systems, probabilistic outcomes, user preferences, or
  future events.

Mixed tasks must be decomposed. Apply the deterministic covenant to the parts
that can be verified and the non-deterministic covenant only to the remaining
uncertainty. Do not describe a problem as uncertain merely to avoid checking it.

## 2. Deterministic Problems

For deterministic problems, use **First Principles + Bayesian Updating +
Occam's Razor**.

### First principles

1. Reduce the problem to observable facts, explicit constraints, invariants,
   and required outputs.
2. Separate facts from assumptions and implementation conventions.
3. Derive the solution from those constraints rather than copying a familiar
   pattern without proving that it applies.

### Bayesian updating

1. When the cause or state is initially unknown, enumerate a small set of
   competing hypotheses.
2. Prefer evidence that most strongly distinguishes those hypotheses.
3. Update confidence when new evidence arrives. Do not preserve a hypothesis
   after reproducible evidence contradicts it.
4. When direct verification is available, run it and collapse the uncertainty;
   do not substitute subjective probability for a testable fact.
5. Do not invent numerical priors or false precision. Qualitative confidence is
   acceptable when the evidence does not support meaningful numbers.

### Occam's razor

1. Choose the simplest explanation and implementation that satisfies all known
   evidence, constraints, and failure cases.
2. Simplicity must not remove required behavior, observability, evidence, or
   recovery paths.
3. Add abstractions only after a concrete variation or repeated pattern proves
   that the abstraction is needed.

## 3. Non-deterministic Problems

For non-deterministic problems, use **Bounded Bayesian Reasoning + Phase-Change
Recognition + Mean-Time Optimality**.

### Bounded Bayesian reasoning

1. Define the decision boundary, evidence budget, time horizon, and acceptable
   loss before researching indefinitely.
2. Maintain a bounded set of plausible hypotheses or options. Merge or remove
   options that no longer change the decision.
3. Update confidence from source quality, recency, independence, and directness.
4. Make uncertainty explicit with ranges, confidence labels, missing evidence,
   and conditions that would change the conclusion.
5. Stop gathering evidence when its expected decision value is lower than its
   acquisition and verification cost.

### Phase-change recognition

1. Identify thresholds where the governing regime changes rather than assuming
   smooth continuation. Examples include authentication becoming mandatory,
   a price crossing a hard budget cap, a site entering captcha mode, or a
   capability becoming available only on a higher trim.
2. Monitor leading indicators of those thresholds.
3. When a phase change is observed, invalidate stale assumptions and re-evaluate
   the decision under the new regime.

### Mean-time optimality

1. Optimize expected time to a reliable, usable outcome, not merely the latency
   of the next action.
2. Include discovery, execution, verification, failure recovery, maintenance,
   and likely rework in the time estimate.
3. Prefer a slightly slower path when it materially reduces expected retries or
   silent errors; prefer a faster reversible probe when it cheaply reduces the
   largest uncertainty.

## 4. Shared Evidence Rules

1. Evidence precedes claims. A documented capability is not considered live
   until it is verified in the current environment when verification is
   practical.
2. Preserve provenance for decision-relevant data: source, URL or identifier,
   retrieval time, applicable market/region, and confidence or verification
   status.
3. Never silently ignore unsupported filters, unknown fields, failed sources,
   conflicts, captcha challenges, or stale data. Return them explicitly.
4. Prefer reversible, low-cost probes before expensive or state-changing work.
5. State what would falsify or materially change a recommendation.

## 5. SourcePort Design Guardrails

1. Keep source-operation contracts evolvable. Use a stable request/result
   envelope with independently versioned operation schemas instead of a
   prematurely universal query model.
2. Unknown criteria must be preserved and reported as unsupported or unresolved;
   they must never be dropped silently.
3. Separate generic capability concepts from vendor product names. For example,
   ADAS is the generic category of advanced driver-assistance systems, while
   HUAWEI ADS is one vendor's system. Do not model either as a single universal
   boolean.
4. Represent claimed automation level, operating domain, concrete functions,
   hardware, software/version, trim availability, optional packages,
   subscriptions, regional availability, and evidence independently whenever
   those distinctions affect a decision.
5. Source adapters retrieve and normalize evidence. SourcePort core routes,
   diagnoses, records provenance, and exposes recovery actions. Domain logic
   searches across sources, filters, compares, and ranks outside the core.
   Agent skills orchestrate those capabilities; they do not replace tested
   implementation code.
