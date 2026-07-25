# Criteria and Evidence

## Brief Shape

Use an open criterion list instead of a fixed universal car-query schema:

```json
{
  "query": "武汉15万落地，没有私桩，辅助驾驶优先，SUV优先",
  "market": { "country": "CN", "city": "武汉", "currency": "CNY" },
  "criteria": [
    {
      "key": "budget.onRoad.maxCny",
      "label": "落地价不超过15万元",
      "kind": "hard",
      "priority": 100,
      "requirement": { "maxCny": 150000 }
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
applicable Wuhan transaction price.

Do not invent a zero tax, insurance range, registration cost, subsidy, trade-in
discount, financing discount, or dealer quote. When one required component is
missing, keep the overall budget result `unknown` even if an estimate range is
shown.
