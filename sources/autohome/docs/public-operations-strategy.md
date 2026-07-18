# Autohome Public Operations Strategy

Verified: 2026-07-18 (Asia/Shanghai)

## Bounded live observations

1. `https://www.autohome.com.cn/grade/carhtml/B.html` returned HTTP 200 and a
   server-rendered brand catalog containing stable `li id="s<seriesId>"` rows.
2. `https://k.autohome.com.cn/6548` returned HTTP 200 and a Next.js
   `__NEXT_DATA__.props.pageProps` payload containing `baseData` and
   `qualityData` for 宝马X5.
3. Both pages were readable without login in the current environment. No
   signed keyword-search or per-trim endpoint was used.
4. The built SourcePort CLI returned live `success` for both operations. The
   score smoke for series `6548` returned 宝马X5, overall score `4.41`, source
   URL `https://k.autohome.com.cn/6548`, and retrieval time
   `2026-07-18T15:54:03.272Z`.

## Selected operations and backend order

- `list-brand-series`: public brand catalog, then explicit manual verification
  only if a recognizable block page appears.
- `get-series-score`: public owner-score SSR payload, then explicit manual
  verification only if a recognizable block page appears.

The parsing approach was adapted from OpenCLI 1.8.6 under Apache-2.0 and
changed to preserve SourcePort evidence, failure classification, and structured
fields. Unexpected shapes fail closed as `source_drift`.
