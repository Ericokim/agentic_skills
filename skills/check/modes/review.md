# Mode: review

A senior read of the diff by a reader that did not write the code.

## Why a different reader

A model reviewing its own output shares its own blind spots. It re reads its
intent rather than the text, and confirms the design it already chose. So the
review runs with a fresh context, and with the model set explicitly rather than
inherited from the session.

Where no second reader can be spawned, run inline and state in the report that
the review was not independent. Do not quietly present it as though it were.

## What the reviewer receives

The diff, the spec's acceptance criteria, and AGENTS.md for the project's
conventions. Nothing about how the code came to be written: reasoning from the
author biases the reader toward the author's conclusion.

## What the reviewer looks for, in order

1. **Correctness.** Does it do what the acceptance criteria say, including at
   the boundaries: empty, one, many, concurrent, failed.
2. **Security.** Untrusted input reaching a sink. Authorization checked at the
   boundary that matters, not only in the interface.
3. **Data integrity.** Migrations that lose data or cannot roll back. Writes
   that are not idempotent where they are retried.
4. **Contract drift.** Behavior that changed for existing callers without
   anyone deciding it should.
5. **Convention.** Only where breaking it will cost someone later.

## Findings

Ranked by severity. Each one carries a `file:line` and a concrete failure
scenario: the input, then the wrong result.

A finding with no failure scenario is a style opinion. Those are allowed, and
they are labeled as opinions rather than dressed up as defects.

The reviewer reports. The reviewer does not edit code, because a reviewer that
fixes as it reads leaves nobody able to say what was actually wrong.

## Output

Write to `docs/reviews/<date>-<feature>.md`. In the summary, give the count by
severity and the single most important finding. The author resolves each finding
or records an explicit deferral with a reason.
