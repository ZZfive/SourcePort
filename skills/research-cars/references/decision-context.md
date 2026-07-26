# Decision Context Evidence Rules

Use the corpus as the only assessment evidence set. Do not add unsupported web
claims to `assessment.json`.

## Assessment shape

Provide four arrays: `events`, `ownerSignals`, `conflicts`, and `unknowns`.
Every item must include non-empty `subjectIds`, `documentIds`, and `evidenceIds`
that exist in the corpus.

Events also require:

- `verification`: `confirmed`, `supported`, `single-source`, `unverified`, or
  `conflict`;
- `applicability`: `direct`, `indirect`, `unknown`, or `not-applicable`;
- `severity`: `critical`, `high`, `medium`, `low`, or `unknown`;
- `remediation`: `none`, `announced`, `in-progress`, `completed`, or `unknown`;
- a plain-language `applicabilityBasis`.

Owner signals require `polarity` and recurrence of `anecdotal`, `repeated`, or
`cross-source`.

## Admission rules

- Brave results are discovery leads. Discovery-only evidence must remain
  `unverified` and cannot confirm an event.
- Use `confirmed` only with official-primary evidence. Use `supported` only
  with at least two independent source families. Same-site reposts are one
  family.
- A single media article can be `single-source`; it is not official
  confirmation.
- Mark a supplier event `direct` only when corpus subject relations and cited
  evidence connect that supplier to the exact series, trim, or affected batch.
  Otherwise use `indirect` or `unknown`.
- Keep one owner complaint `anecdotal`. `repeated` requires at least three
  distinct content items or authors. `cross-source` also requires two source
  families.
- If publication and occurrence dates are unknown, say `date unknown`; do not
  call the event recent.
- Preserve conflicting evidence in `conflicts` or event verification
  `conflict`; do not choose one side silently.

The compiler derives flags. `pause` is possible only for direct, high or
critical, unresolved events with official or independently cross-verified
support. Completed remediation lowers the flag. All flags remain advisory.
