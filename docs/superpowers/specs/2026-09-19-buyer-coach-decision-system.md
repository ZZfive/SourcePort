# Buyer Coach Decision System

Date: 2026-09-19

Status: Proposed; personal inputs remain runtime configuration

## 1. Why the two research chains need a shared layer

The car and property consumers already preserve source provenance and expose
bounded evidence. They answer “what can we verify about this candidate?” The
current user need is broader: learn enough to recognize misleading claims,
define safe financial limits, and move from a shortlist to a defensible
purchase decision.

That need belongs in a consumer-layer buyer coach. It must not move domain
ranking or recommendation into SourcePort core, and it must not commit a
personal city, budget, income, or timeline to the repository.

## 2. Inferred buyer profile

The initial profile is a household decision with two parallel tracks:

- car: potentially earlier, with continuous market observation before buying;
- property: target completion within the next year;
- household: marriage planning and a possible child, with the timing uncertain;
- finance: a large down-payment capability is known, but safe monthly payment
  and liquid-reserve limits are not yet defined;
- property preferences: commute balance, living quality, total cost, and a
  university-adjacent environment all matter;
- car preferences: commute, holiday long-distance travel, safety, and ownership
  cost;
- interaction mode: education and research should be combined.

These are hypotheses for the coach. The values must be supplied through a
private input file or runtime parameters and can be revised after each
conversation.

The coach must keep “near a university” separate from school-admission or
school-district claims. A university may be a useful lifestyle, transport, and
amenity preference; it is not evidence of future child education access.

## 3. Maturity assessment

The car chain is currently one stage ahead. It has a bounded discovery ledger,
series-to-trim resolution, exact configuration evidence, owner signals,
official notices, supplier context, delivery evidence, alternatives, and a
pause state for unresolved hard conditions.

The property chain has a sound research MVP: listing leads, commute evidence,
official housing documents, cost and mortgage scenarios, risk evidence,
snapshots, and explicit asking-versus-transaction semantics. It still needs
transaction-grade price evidence, property-specific inspection workflows,
financing eligibility checks, negotiation evidence, and contract-stage gates.

Neither chain should be treated as an autonomous purchasing system yet. Both
are suitable for evidence-led research; the property chain needs more work
before it can support a transaction checklist comparable to the car chain's
configuration and risk checks.

## 4. Shared decision model

The buyer coach should expose one common lifecycle while keeping domain fields
inside the car and property consumers:

1. **Understand**: teach the concepts needed for the current decision.
2. **Bound**: collect time, cash-flow, reserve, usage, and household limits.
3. **Explore**: discover a bounded candidate set with provenance.
4. **Compare**: separate hard constraints, preferences, and unknowns.
5. **Verify**: turn each unknown into a source query, viewing, test drive, or
   document request.
6. **Negotiate**: record offer, counter-offer, fees, and expiry dates.
7. **Contract gate**: require critical evidence before signing or paying.
8. **Review**: record the decision and update future preferences.

Every stage should produce both a short lesson and a concrete action list. A
candidate cannot pass a gate when a critical unknown is silently treated as a
pass.

## 5. Immediate implementation phases

### Phase A: buyer profile and safety boundaries

Add a consumer-layer profile schema with runtime-only values for:

- purchase timing for each domain;
- household scenarios and child-planning uncertainty;
- cash available, safe monthly payment, liquid reserve, and existing debt;
- commute anchors and maximum acceptable travel time;
- vehicle use scenarios and powertrain constraints;
- property preferences, including university proximity as a preference;
- coaching mode and unanswered questions.

The first financial lesson should derive a safe payment range from household
cash flow and reserve goals. A provident-fund contribution is one input, not a
monthly-payment limit by itself.

Because the household may buy a car and a property in the same planning
window, the coach must calculate one shared liquidity budget. It should keep
these inputs separate and configurable:

- monthly net household income and income stability;
- annual baseline spending, excluding the two purchases;
- current liquid reserve;
- optional wedding, family-support, renovation, and other near-term large
  expense scenarios;
- car cash/finance scenarios and property upfront-cost scenarios;
- a configurable reserve floor expressed as months of baseline spending, with
  optional known near-term commitments added only when the buyer chooses to
  model them.

The coach should show the remaining reserve after each purchase combination and
flag a plan when the combination crosses the configured reserve floor. It must
not treat the maximum possible down payment as the recommended down payment,
and it must not silently convert uncertain future expenses into hard limits.
The default case assumes the supplied income continues; a separate stress case
can model temporary income loss or optional large commitments.

### Phase B: learning and evidence gates

Create reusable lessons and gates for both domains:

- price vocabulary and reference price versus transaction price;
- total-cost composition;
- source quality and claimed versus verified evidence;
- common sales-pressure and contract traps;
- the exact documents or observations required to clear each gate.

### Phase C: domain completion

For cars, prioritize local deal evidence, test-drive tasks, ownership-cost
scenarios, and powertrain selection.

For property, prioritize transaction/offer observations, loan and tax
eligibility, viewing/inspection checklists, ownership/encumbrance documents,
property-management evidence, and negotiation/contract tasks.

### Phase D: periodic monitoring

Keep car research in a low-frequency watch mode until the purchase window is
real. Keep property research on a deadline-driven cadence, with candidate
refresh, price observations, route checks, and document verification.

## 6. Acceptance criteria

The next usable version is complete when a new user can:

1. fill in a private profile without editing source code;
2. see what they know, what they do not know, and why each unknown matters;
3. receive separate car and property candidate reports;
4. get a small number of verification tasks rather than an unbounded link list;
5. understand why a candidate is paused or recommended for the next step;
6. keep all personal values and observations out of committed example data.

No new source should be added solely to increase candidate count before these
gates exist. A source is valuable when it closes a decision-relevant evidence
gap.
