# YouTrack MCP Roadmap

This roadmap evolves YouTrack MCP into a reusable, safe operating layer for WB/product delivery,
internal tooling, and personal projects. The generic core must not encode project IDs, board IDs,
workflow names, or organization-specific policy.

## Status model

| Status | Meaning |
|--------|---------|
| **Current** | Shipped or live-proven baseline behavior; each capability row states its evidence and safety limits. |
| **In progress** | Implementation exists or is under development, but the build, contract tests, reload, or live canary gate is not complete. |
| **Planned** | Target behavior and acceptance criteria are defined; no availability claim is made. |

## Design commitments

1. **API-first, typed tools.** Supported operations use explicit schemas and YouTrack APIs. Raw
   command execution remains an escape hatch, not the default interface for common workflows.
2. **Capability and version discovery.** Tools gate behavior on runtime-discovered server version,
   fields, endpoints, and permissions instead of assuming one YouTrack release. The compatibility
   program covers the live WB 2024.3 deployment and versioned 2025.2/2026.x contracts.
3. **Least privilege and preflight.** Every mutating workflow checks access, resolves references,
   validates supported capabilities, and reports its intended scope before writing.
4. **Dry-run and preview.** A preview is a zero-write operation that returns the exact intended
   targets, canonical payload, notification mode, preconditions, and expected effects.
5. **Exact target and payload freeze.** Apply accepts the frozen preview, identified by a digest,
   rather than re-resolving a broad query or rebuilding the payload. Target or capability drift
   invalidates the plan and requires a new preview.
6. **Idempotency.** Retrying an accepted plan must not duplicate an effect. Operations converge on
   desired state and use an idempotency key or equivalent deduplication record where the upstream
   API does not provide one.
7. **Post-write readback.** Success is reported only after the affected resources are read back and
   checked against the expected state. Partial or unverifiable outcomes remain explicit.
8. **Notification control.** Each write exposes its effective notification behavior in preview and
   audit output. A tool or profile must never silently change that choice.
9. **Audit trail.** Plans and results record actor context, target digest, redacted payload digest,
   capability snapshot, timestamps, readback, and per-target outcome.
10. **No hidden browser fallback.** If the API or required permission is unavailable, the tool
    returns a typed unsupported/preflight result. It does not open or automate a browser behind the
    caller's back.
11. **Project profiles stay outside the generic core.** The core may own a profile schema and
    validator; concrete project mappings and policy live in their owning configuration repository
    and are loaded explicitly.
12. **Secrets are never exposed.** Tokens, cookies, authorization headers, secret profile values,
    and unredacted credentials must not appear in previews, audit records, logs, fixtures, examples,
    MCP responses, or repository files.

## Capability matrix

| Capability | Current baseline | Target contract | Milestone | Status |
|------------|------------------|-----------------|-----------|--------|
| Generic commands | Raw command apply/suggest supports multiple issues and explicit notification muting; sprint transfer through this path is proven on live WB 2024.3. | Retained as an explicit expert escape hatch with the same safety and audit boundaries as typed tools. | M0-M2 | **Current** |
| Manual sprint membership | The generic command path moved and verified 19 live WB cards. The typed assign/unassign wrapper is built, contract-tested, exposed by a fresh MCP runtime, and uses fresh target/readback checks; a safe typed live assign-and-unassign mutation canary has not yet been executed. | Typed assign and unassign resolve board and sprint references, issue one Board command for the explicit issue set, and verify membership by readback. | M0 | **In progress** |
| Workflow state and board columns | Typed enum/state bundle operations and `columnSettings`/`sprintsSettings` reads are built and contract-tested. Board details also expose the public `estimationField` and `originalEstimationField` card settings. A fresh read-only runtime canary passed against live WB 2024.3; the live shared state bundle correctly failed its write-permission preflight, and board-column mutation is intentionally not implemented. | Typed state-bundle values and ordered board columns expose stable IDs, field values, resolved state, ordinals, and WIP limits without assuming workflow names. Column writes remain disabled until a version-proven payload can be frozen and verified through M2. | M1 | **In progress** |
| Safe bulk changes | Bulk commands exist, but there is no complete dry-run/freeze/idempotency/readback transaction envelope. | A bounded plan/apply/result envelope freezes exact targets and payload, controls notifications, detects drift, verifies outcomes, and records a redacted audit trail. | M2 | **Planned** |
| Project-specific behavior | The core can be scoped through runtime configuration, but reusable policy profiles are not yet a stable contract. | Declarative, validated external profiles map discovered capabilities to project policy without adding identifiers or business rules to the generic package. | M3 | **Planned** |
| Version compatibility | Documentation targets 2025.2 and the live WB path exercises 2024.3, but runtime discovery and release evidence are not yet unified. | Machine-readable capability discovery plus contract fixtures, CI, live canary evidence, and release metadata for 2024.3, 2025.2, and supported 2026.x variants. | M4 | **Planned** |

## Milestones

### M0 - Manual sprint assignment and unassignment via commands

- Expose typed `assign` and `unassign` actions that use the YouTrack Board command for both manual
  sprint boards and boards backed by a sprint sync field.
- Resolve board and sprint references through the API; do not embed environment-specific
  identifiers or names.
- Reject empty, ambiguous, inaccessible, or mismatched target sets before mutation.
- Cover command construction and both directions with unit/contract tests.
- Pass build, MCP server reload, an assign/readback canary, and an unassign/readback canary on the
  live 2024.3 deployment before moving M0 to **Current**.

### M1 - Typed state bundles and board `columnSettings`

- Add typed list/get/create/update contracts for state bundles and state values, including
  `isResolved`, ordering, and archival metadata.
- Read board columns from `columnSettings`, preserving stable column IDs, order, field values, and
  WIP limits. Do not infer columns from presentation text.
- Read `estimationField` and `originalEstimationField` from the public Agile resource. These card
  settings identify the estimation fields but do not reveal how the board chart is calculated.
- Discover which state bundle and board field belong to a target project before proposing changes.
- Keep board-column mutation out of scope until it can use the M2 safety envelope.
- Add versioned contract fixtures and live read-only probes for the supported 2024.3, 2025.2, and
  2026.x response shapes.

#### Live YouTrack 2024.3 public-API boundary

The live server's own `/api/openapi.json` identifies itself as `2024.3` and exposes
`GET|POST|DELETE /agiles/{id}`. Its contract marks `Agile.columnSettings` as read-only, while
nested `AgileColumn.ordinal`, `fieldValues`, and `wipLimit` are writable. The official
[Update a Specific Agile](https://www.jetbrains.com/help/youtrack/devportal/operations-api-agiles.html#update-Specific-Agile-method)
example proves only a full-list nested update of WIP limits. It does not define how to create a
board-local `AgileColumnFieldValue` for a newly added State value, nor an unambiguous add/remove
column payload. The bundle value ID and the board-local column field-value ID are different
resources, so a state-bundle write cannot be reused as a board-column write by assumption.

The same live OpenAPI contains no chart or burndown resource, schema, operation, or
chart-calculation attribute. The only public Agile attributes it exposes for estimation-field
selection are `estimationField` and `originalEstimationField`. Therefore the MCP must not infer
`Burndown calculated by = Estimation` from the selected estimation field and must not call the
browser UI's private endpoints as an API fallback.

Until a supported version supplies an explicit public contract, or a separately owned custom
YouTrack endpoint is introduced, the safe behavior is:

1. read and freeze the complete current column snapshot;
2. return a typed unsupported preflight for add/remove/reorder requests that need an unproven
   board-local mapping payload;
3. return a typed unsupported preflight for chart calculation reads or writes;
4. keep any UI-only change manual and separately verified, rather than hiding browser automation
   inside the connector.

### M2 - Safe bulk transaction envelope

- Introduce a typed `plan -> apply -> result` contract for every broad or multi-target mutation.
- Freeze the resolved target set, canonical payload, capability snapshot, notification mode,
  preconditions, expiry, and digest in the plan.
- Require apply to reference that exact plan; reject expired plans, scope drift, permission drift,
  and payload changes.
- Bound batch size and concurrency, use idempotency keys, and report per-target partial outcomes
  without claiming atomic rollback the YouTrack API cannot guarantee.
- Perform post-write readback and emit a redacted audit record for success, failure, or an
  indeterminate outcome.
- Contract-test that preview performs no writes and that retries cannot duplicate effects.

### M3 - Declarative project profiles and policy

- Define a versioned profile schema for field roles, board/sprint selection rules, workflow
  mappings, notification defaults, write allowlists, batch limits, and approval policy.
- Run one canonical MCP server alias per profile. Do not register case-only duplicate aliases that
  point to the same runtime and spawn duplicate processes; use explicitly named scoped/admin
  profiles only when their permissions and project boundaries genuinely differ.
- Resolve every concrete reference at runtime from discovery results; profiles contain no secrets
  and generic defaults contain no project identifiers.
- Validate profiles against the discovered capability manifest before enabling dependent tools.
- Keep concrete WB/product, internal-tooling, and personal profiles outside the generic core in
  their owning configuration repositories.
- Allow the same typed tool contract to operate across profiles while returning explicit policy
  denials and unsupported capabilities.

### M4 - Compatibility CI and release discipline

- Publish a machine-readable capability manifest containing server identity/version, supported
  operations, relevant field shapes, permission checks, and known compatibility limitations.
- Run versioned contract suites for 2025.2 and supported 2026.x shapes, plus a separately controlled
  live canary gate for WB 2024.3. Live credentials remain runtime-only and are never captured in CI
  artifacts.
- Gate each feature on discovered capabilities, with typed unsupported results instead of silent
  degradation or browser automation.
- Version tool schemas and profile schemas, define deprecation windows, and test client-visible
  compatibility before release.
- Release notes declare the tested compatibility matrix and link to the exact contracts and test
  evidence used for the claim.

## Source of truth

- Generic behavior, schemas, compatibility claims, and milestone status are owned by this
  repository's docs, code, contracts, and tests.
- Concrete profiles are owned by their project/configuration repositories outside the generic
  core.
- Brain may contain domain operating notes and links to these owners. It is not the source of truth
  for MCP contracts, implementation status, copied project profiles, or credentials.

No milestone may be marked **Current** solely because code exists. The relevant build, repository
tests, compatibility evidence, reload, and live canary gates must pass first.
