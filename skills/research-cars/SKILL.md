---
name: research-cars
description: Research, filter, and compare purchasable car candidates through SourcePort using bounded Dongchedi and Autohome evidence. Use when a user asks which car to buy, wants candidates under a budget, provides exact configuration or driving-assistance requirements, wants a comparison table, or needs source-backed verification of specific models or trims.
---

# Research Cars

Turn a natural-language car-buying request into a bounded `CarResearchBrief`,
run SourcePort, and explain the evidence without hiding unknowns or conflicts.

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
7. Choose one primary output before execution. Use Markdown for a normal
   user-facing comparison. Use JSON only when programmatic inspection is
   necessary and the environment can retain the complete output. Write the
   brief with the available file-edit mechanism, then run exactly once:

   ```bash
   sourceport research-cars --input-file <brief.json> --format <md|json>
   ```

   Do not repeat a completed live research solely to switch formats or recover
   truncated terminal output. Choose Markdown before execution when a full
   JSON report is likely to exceed the tool's output limit.
8. Explain candidates in the report's deterministic order. Separate eligible,
   needs-verification, and rejected candidates. Cite evidence URLs or IDs for
   decision-relevant claims.
9. State the bounded coverage and the conditions that could change the result.
   Never describe the output as a full-market search.

## Interpretation Rules

- Reject a candidate only when a hard condition has evidence-backed `fail`.
- Do not recommend a candidate whose hard condition is `unknown`, `conflict`,
  or `unsupported`; label it `needs-verification`.
- Do not translate absent configuration data into "not supported".
- Do not turn a source reference price into a Wuhan transaction or on-road
  price. Treat the budget result as unknown unless all mandatory cost evidence
  is dated and applicable.
- Do not replace the report's ordering with a hidden score.
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
- evidence, warnings, recovery actions, and coverage limitations.
