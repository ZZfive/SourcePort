---
name: research-cars
description: Research, filter, and compare purchasable car candidates through SourcePort using bounded vehicle data, owner experience, official notices, recent company events, and supply-chain context. Use when a user asks which car to buy, wants candidates under a budget, provides exact configuration or driving-assistance requirements, wants a comparison table, asks about recalls or owner feedback, or needs source-backed verification of specific models, trims, manufacturers, or relevant suppliers.
---

# Research Cars

Turn a natural-language car-buying request into one bounded paper-data report
and one decision-context report. Preserve eligibility and ordering from the car
report; context flags are advisory and never auto-reject a candidate.

## Workflow

1. Confirm the `sourceport` executable is on `PATH`. If it is missing, report
   that the repository CLI must be built and linked; do not hard-code a local
   repository path.
2. Read [sourceport-operations.md](references/sourceport-operations.md) before
   selecting operations or diagnosing source failures.
3. Run `sourceport doctor autohome --json` and
   `sourceport doctor dongchedi --json`. Continue through a degraded source
   only when the report says the required operations remain available. Stop on
   an unavailable blocked operation and present its recovery actions.
4. Translate the request into a structured brief:
   - preserve the original query and market;
   - mark an explicit ceiling or exclusion as `hard`;
   - mark ranking wishes as `preference` in the user's stated priority order;
   - mark usage facts such as no private charger as `context` unless the user
     explicitly converts them into an exclusion;
   - generate at most eight brand or series seeds and treat them as hypotheses,
     never as evidence;
   - for an open-ended first pass, prefer five seeds and set explicit limits of
     eight expanded series, five scanned series, three exact configurations,
     five final candidates, and three owner reviews per series; increase them
     only when the added evidence could change the decision;
   - do not invent tax, insurance, registration, dealer-quote, or policy
     evidence.
5. Read [criteria-and-evidence.md](references/criteria-and-evidence.md) when
   constructing criteria, cost evidence, or interpreting `unknown`, `conflict`,
   and `unsupported`.
6. Read [driving-assistance.md](references/driving-assistance.md) whenever the
   request mentions intelligent driving, ADAS, ADS, autonomous driving,
   parking, sensors, chips, subscriptions, or exact trim availability.
7. Use Markdown for the user-facing comparison and always retain the complete
   JSON sidecar. Write the brief with the available file-edit mechanism, then
   run the live car research exactly once:

   ```bash
   sourceport research-cars --input-file <brief.json> --format md \
     --report-file <car-report.json>
   ```

   Do not repeat live research to switch formats or recover truncated output.
8. Unless the user explicitly excludes background research, run doctors for
   `samr`, `brave-search`, `36kr`, and `xiaohongshu`, then collect context only
   for the final candidates:

   ```bash
   sourceport car-context collect --report-file <car-report.json> --format md \
     --corpus-file <context-corpus.json>
   ```

   Continue with a partial corpus. Xiaohongshu login or browser failure must
   not erase official, media, discovery, or reused Dongchedi evidence.
9. Read [decision-context.md](references/decision-context.md). Use the compact
   corpus Markdown to create `<assessment.json>`. Every event, owner signal,
   conflict, and unknown must cite document and evidence IDs present in the
   corpus. Then run deterministic compilation:

   ```bash
   sourceport context compile --corpus-file <context-corpus.json> \
     --assessment-file <assessment.json> --format md \
     --report-file <context-report.json>
   ```
10. Explain candidates in the car report's deterministic order. Pair each
    candidate with owner signals, events, advisory flags, source failures, and
    unknowns. Do not reorder or change `eligible`, `needs-verification`, or
    `rejected` from context evidence.
11. State bounded coverage, sample bias, failed sources, and the evidence that
    could change the conclusion. Never describe the output as full-market or
    comprehensive web coverage.

## Interpretation Rules

- Reject a candidate only when a hard condition has evidence-backed `fail`.
- Do not recommend a candidate whose hard condition is `unknown`, `conflict`,
  or `unsupported`; label it `needs-verification`.
- Do not translate absent configuration data into "not supported".
- Do not turn a source reference price into a Wuhan transaction or on-road
  price. Treat the budget result as unknown unless all mandatory cost evidence
  is dated and applicable.
- Do not replace the report's ordering with a hidden score.
- Do not create a sentiment or public-opinion score. Search heat, one complaint,
  or an unrelated supplier event is not a vehicle risk verdict.
- Treat `context-only`, `watch`, `verify-before-buy`, and `pause` as prompts for
  follow-up, not automatic eligibility changes.
- Do not bypass authentication, captcha, access verification, or rate limits.
  Ask the user to complete the reported recovery step and rerun the command.

## Expected Output

Present:

- the bounded candidate set and rejected seeds;
- exact trims, not only series names;
- a criterion-by-criterion result matrix;
- a separate driving-assistance matrix;
- on-road cost status and missing components;
- cross-source match status;
- owner-experience signals and their recurrence level;
- recent events, recalls/remediation, supplier applicability, and advisory
  decision flags;
- conflicts and unknowns that could change the decision;
- evidence, warnings, recovery actions, and coverage limitations.
