# Wuhan property mini-program observations

This source is intentionally manual or browser-assisted. It covers named
channels such as the Fang mini-program, Beike mini-program, Wuchang Housing
Market, and Wuhan housing-service mini-programs without pretending that their
authenticated or QR-code flows are public HTTP APIs.

`record-observation` requires a candidate identity, program name, observed time,
and either a share reference or browser URL. The resulting evidence is marked
`claimed`, because the adapter records an observation supplied by a person or a
browser session. Without that provenance it returns a human-verification
recovery action instead of accepting an untraceable property claim.
