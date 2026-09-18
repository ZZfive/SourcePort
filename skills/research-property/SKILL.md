---
name: research-property
description: Research purchasable new and resale residential properties through SourcePort using bounded listings, official transaction evidence, cost scenarios, commute anchors, and explicit due-diligence gaps.
---

# Research Property

Turn a natural-language home-buying request into one bounded property report.
Read the city, budget, layout, and commute destinations from the user or a private
brief; never infer personal defaults from examples. Keep separate new-home and
resale lanes and an all-in budget. Preserve source provenance and distinguish
listing leads from official ownership, permit, tax, financing, and transaction
evidence.

## Workflow

1. Translate the request into a `PropertyResearchBrief`:
   - preserve the city and original query;
   - encode the budget as `budget.maximumAllInCny` when the user gives a total
     budget;
   - keep new and resale candidates separate;
   - represent bedrooms, living rooms, and commute anchors independently;
   - mark explicit exclusions as `hard`, wishes as `preference`, and missing
     financial or commute limits as unknown.
2. Keep the all-in budget components separate: purchase price, tax, agency fee,
   registration, maintenance fund, renovation, parking, and loan fees. A
   listing price is not an all-in total or a verified transaction price.
   Cost evidence is applicable only when its market, exact candidate ID,
   validity window, source URL, and verification status match. Conflicting
   quotes are observations requiring reconciliation; they are not additive.
3. Resolve candidates to the most precise identity available:
   city, community, building, unit, and room. Do not merge candidates when
   only the community name matches.
4. Evaluate both commute anchors separately and retain the worst and average
   commute when route evidence is available. Do not invent a maximum commute
   when the user did not supply one.
5. Treat missing ownership, encumbrance, presale-permit, delivery, school, or
   planning evidence as an explicit verification gap.
   An official policy page explains a rule; it does not prove that a specific
   home has a permit or clear title. Tie those claims to an exact property
   document.
6. Run the deterministic report first, then add source adapters and official
   evidence. Source failures, login walls, captcha, stale data, and source
   drift must remain visible with recovery actions.

## Expected output

Present separate new and resale candidate sets, all-in cost scenarios, both
commute results, layout match, eligibility, evidence completeness, risks,
unknowns, source warnings, coverage limits, and a buyer-side verification
checklist. Do not turn a future price view, one owner comment, or a listing
description into a purchase recommendation.

The local deterministic CLI accepts a brief and normalized candidate fixture:

```bash
sourceport research-property \
  --input-file private/property-brief.json \
  --candidates-file normalized-candidates.json \
  --format md \
  --report-file property-report.json
```

Probe current Wuhan official policy evidence separately before using it in a
candidate report:

```bash
sourceport doctor wuhan-housing --json
sourceport run wuhan-housing get-official-page \
  --input '{"url":"https://gjj.wuhan.gov.cn/bsfw/ywzl/ywzn/dkyw/202412/t20241219_2504837.html","topic":"mortgage"}'
```
