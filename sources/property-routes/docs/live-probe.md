# Property route source live probe

`property-routes` is an evidence adapter for public map pages. A request must
provide the route URL, origin, destination, mode, and optionally a departure
window. `candidateId` and `anchorId` are context fields used by
`property-discover` to attach a verified duration to one candidate.

The adapter allowlists Baidu Map and AMap public hosts, then tries public HTTP,
OpenCLI browser retrieval, and a manual recovery step. Map pages frequently
render route results in client-side code or require verification. In those
cases the operation keeps `evidenceStatus: "unresolved"` or returns an explicit
blocked result; it never estimates a duration.
