# SourcePort

Stable, diagnosable, evidence-preserving access to specified web sources for AI
agents.

SourcePort turns source-specific retrieval paths—public HTTP, OpenCLI adapters,
logged-in browser sessions, and human-assisted recovery—into explicit source
operations with structured results and provenance.

## Boundary

SourcePort is an information-access layer. It is responsible for:

- source capability discovery;
- source-specific operations and versioned schemas;
- ordered backend routing and fallback;
- authentication, captcha, rate-limit, timeout, and drift diagnosis;
- structured data plus raw evidence and retrieval metadata;
- fixtures, contract tests, live probes, and recovery guidance.

SourcePort does not own cross-source recommendation or domain decisions. A
consumer skill may use SourcePort to research cars, housing, or another domain,
but filtering and ranking remain outside the core.

## First validation slice

The first consumer is a car-research skill backed by Dongchedi and Autohome
source adapters. It validates that SourcePort can retrieve exact series, trim,
configuration, price, and review evidence without turning the core into a car
decision engine.

## Status

SourcePort is in the design phase. See
[the stable site acquisition design](docs/superpowers/specs/2026-07-18-sourceport-stable-site-acquisition-design.md).
