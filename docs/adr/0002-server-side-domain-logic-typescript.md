# 0002. Server-side domain logic in TypeScript on Postgres/PostGIS

Status: accepted

## Context
Requirement N1 (SPEC): the app must be portable to other platforms. Claim and scoring rules will also change often during tuning, and must not need an app release.

## Decision
- Classification post-processing, loop detection, scoring and ownership run on the server.
- Server is TypeScript (Node), with Postgres + PostGIS and `h3-js`.
- The HTTP contract is documented in `api/openapi.yaml`.

## Consequences
- One small service and one database are enough for v1 (100 users).
- v2/v3 scale path: queue for claim processing, read replicas, then sharding by H3 parent cell.
