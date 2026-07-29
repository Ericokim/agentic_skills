# Scope: <product or slice name>

<One paragraph: what this is for and who uses it. Written for someone who has
never seen the repo.>

**Depth:** Prototype | Alpha | Beta | GA
**Updated:** <date> from <commit sha or "initial">

## Features

Coarse units of user visible value, in build order. A feature is a name, an
outcome, and a status. Tasks belong in a spec, not here.

| # | Feature | Outcome a user gets | Status | Spec |
|---|---------|---------------------|--------|------|
| 1 | <name>  | <one line>          | queued | <docs/specs/... or "none yet"> |

Status is one of: `queued`, `in-progress`, `done`, `dropped`.

Every status is set from repo evidence, not from memory. If no code exists for a
feature, it is `queued` however much was discussed.

## Out of scope

<What this deliberately does not do, and why. The most useful section in the
file six weeks from now, because it is the one that stops old arguments from
being relitigated.>

## Open decisions

Load bearing choices that are not yet made. Each one is a reason to run
`/architect` before building the feature that depends on it.

- <decision> blocks feature <#>

## Assumed

Decisions that were built on without being ratified. Each is a standing reminder
that a spec owes ratification. These never block declaring a feature done.

- <assumption> in feature <#>, recorded <date>
