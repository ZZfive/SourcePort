# Criteria and Evidence

## Brief Shape

Use an open criterion list instead of a fixed universal car-query schema:

```json
{
  "query": "示例城市示例预算落地，没有私桩，辅助驾驶优先，SUV优先",
  "market": { "country": "CN", "city": "示例城市", "currency": "CNY" },
  "criteria": [
    {
      "key": "budget.onRoad.maxCny",
      "label": "落地价不超过示例预算",
      "kind": "hard",
      "priority": 100,
      "requirement": { "maxCny": 240000 }
    },
    {
      "key": "drivingAssistance.capabilities",
      "label": "辅助驾驶能力优先",
      "kind": "preference",
      "priority": 90,
      "requirement": ["自适应巡航", "车道居中"]
    },
    {
      "key": "bodyStyle.preferred",
      "label": "SUV优先，轿车可接受",
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
    { "kind": "series", "name": "候选车型", "brand": "品牌" }
  ]
}
```

The deterministic MVP recognizes:

- `budget.onRoad.maxCny`;
- `purchase.deliveryBefore` (inclusive `YYYY-MM-DD` or `{ "date": "YYYY-MM-DD" }`);
- `bodyStyle.preferred`;
- `drivingAssistance.capabilities`;
- `drivingAssistance.claimedLevel.min`;
- `ownership.privateCharger` as context.

Preserve every other key. It must appear as `unsupported`, not disappear.

## Result Meanings

- `pass`: direct applicable evidence satisfies the criterion.
- `fail`: direct applicable evidence contradicts the criterion.
- `unknown`: required evidence is absent or not applicable enough to decide.
- `conflict`: available evidence crosses a threshold or disagrees.
- `unsupported`: the current deterministic evaluator does not implement the
  criterion.

Only an evidence-backed hard `fail` rejects. An unresolved hard criterion makes
the candidate `needs-verification`.

## Cost Evidence

An auditable on-road price needs applicable evidence for:

- `vehicle-price`;
- `purchase-tax`;
- `insurance`;
- `registration`.

Each item needs a stable ID, CNY range, mandatory flag, source, retrieval date,
market/applicability, and optional exact series/trim scope. A Dongchedi guide,
dealer, or owner price remains a reference estimate unless verified as an
applicable local-market transaction price.

Do not invent a zero tax, insurance range, registration cost, subsidy, trade-in
discount, financing discount, or dealer quote. When one required component is
missing, keep the overall budget result `unknown` even if an estimate range is
shown.

## Discovery and Query Budgets

The engine enumerates relevant brand catalogues independently of competitor
links. It does not perform whole-market news search: the consumer must supply
recent release leads when that matters. Example (illustrative, not evidence):

```json
{
  "discovery": {
    "brands": ["品牌"],
    "leads": [{
      "name": "待核实新车", "brand": "品牌", "source": "manufacturer",
      "sourceUrl": "https://example.org/release",
      "retrievedAt": "2026-09-12T00:00:00Z", "marketStatus": "announced"
    }]
  }
}
```

Lead status can be `on-sale`, `presale`, `announced`, or `unknown`; it is a
supplied claim, not proof of purchasability. Exact series seeds and leads get
priority; remaining catalogue entries are admitted in rounds across brands.
`discoveredSeries` records unresolved identities, budget omissions, no trims,
and scanned series. `evaluatedTrims` retains all listed trims, including failed
and uninspected configurations. `allCandidates` retains each series representative
before the display cap. A display cap is not rejection or a coverage guarantee.

| Limit | Default | Maximum |
| --- | ---: | ---: |
| initialSeeds | 8 | 64 |
| expandedSeries | 24 | 256 |
| scannedSeries | 8 | 64 |
| exactConfigurations | 16 | 256 |
| finalCandidates | 5 | 5 |
| ownerReviewsPerSeries | 3 | 5 |

Configuration failures consume the global attempt budget. A series is not
rejected merely because its inspected low trim fails while higher trims remain
unknown. The representative is chosen after criterion evaluation, and its
alternatives explain acquisition and eligibility status.

## Delivery Evidence

`purchaseTiming.targetDate` generates a hard delivery criterion.
`budget: { "maximumCny": 240000, "basis": "on-road" }` generates a hard
on-road ceiling. If either is also specified explicitly, both definitions must
agree; duplicate criterion keys are rejected.

A delivery record needs `id`, `source`, HTTP(S) `sourceUrl`, `retrievedAt`,
`validUntil`, local `market`, exact `trimId`, optional `seriesId`, `kind`
(`commitment` or `estimate`), and `earliestDate` / `latestDate` in `YYYY-MM-DD`.
Supply actual documented evidence, not invented sample commitments. The engine
checks scope and validity at report generation time; supplied records remain
`claimed` provenance until independently verified.

Only a current commitment for the exact trim and market can pass. The latest
committed date must be on or before the deadline. A wholly later window fails;
a window crossing the deadline remains unknown. Inconsistent outcomes from
multiple applicable commitments conflict. Estimates, stale evidence, or
wrong-city/trim records cannot establish delivery. A commitment is evidence of
a promise, not a guarantee of the future event.

Required cost components must be marked mandatory. Multiple applicable quotes
for the same required component need reconciliation and keep the total unknown;
they are never added as separate expenses. Supplied cost URLs remain `claimed`
provenance: a URL alone does not establish independent verification.
