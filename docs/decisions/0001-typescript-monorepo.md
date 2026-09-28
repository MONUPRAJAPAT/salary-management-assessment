# ADR-0001 — A TypeScript monorepo with a shared contract package

**Status:** accepted · **Date:** 2026-09-28

## Context

The brief requires a backend and a React UI. The obvious options are two independent repos/folders,
or one workspace. The interesting question is not "how many folders" but **where the API contract
lives**.

## Decision

One repo, npm workspaces, three packages: `@acme/shared`, `@acme/server`, `@acme/web`.
`@acme/shared` holds Zod schemas for every request and response, the money primitives, the domain
enums and the statistics helpers. The server validates with them; the web client infers types from
them.

## Consequences

**Good.** One definition of every API shape. Renaming a response field breaks the UI build
immediately instead of at runtime. Enums (`Level`, `Department`, `ChangeReason`) cannot drift apart.
Money handling is identical on both sides of the wire.

**Cost.** Workspace wiring, and a build-order dependency. Mitigated by consuming `@acme/shared` as
**TypeScript source** rather than a compiled artifact — `vite`, `tsx` and `vitest` all transpile it
directly, so there is no `build:shared` step to forget in development. The production server build
bundles it with `tsup`.

**Rejected:** duplicating types by hand (drifts within a week); generating an OpenAPI client (more
machinery than a 20-endpoint app repays); tRPC (excellent fit, but it hides the HTTP API that a
reviewer should be able to read and `curl`).
