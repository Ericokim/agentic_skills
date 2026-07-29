# The standard

Normative reference for the five rule families, their levels, and the invariants
between them. Version `1.0.0`.

Each family lives in one file under `src/standard/`, and that file owns both the
prose it injects and the checks it enforces. They are together on purpose: a
rule whose text lives in one place and whose check lives in another drifts, and
nothing notices until a skill ships with a rule that no longer says what it
checks.

## Declaring

Every skill declares a level for all five families, explicitly:

```yaml
standard:
  evidence: strict
  anti-hallucination: strict
  tdd: red-green
  review: independent
  done: checklist
```

There are no defaults. A skill that has not said where it stands on evidence has
not decided, and inferring a default on its behalf ships a discipline the author
never agreed to. `off` is a legitimate answer, and it has to be typed.

The block is compile time only. It is stripped from the installed file, because
the installed file carries the resulting rules rather than the request for them.

---

## evidence

`off` · `tagged` · `strict`

Classifies every factual claim by how it was obtained. This is the load bearing
family: the other four lean on it.

| Tag | Meaning | Requires |
|---|---|---|
| `[O]` Observed | You ran it and are quoting the result | The exact command and its verbatim output. Paraphrase is not Observed. |
| `[D]` Derived | You read the source and concluded it | A `file:line` citation per claim |
| `[A]` Assumed | You inferred it and have not checked | Phrasing as an assumption, never as fact |

A tag is never upgraded. If it was not run, it is not `[O]`, however confident
the agent feels.

`tagged` requires the taxonomy be used. `strict` additionally requires every
claim in a report or completion message to carry a tag, so one untagged claim
blocks the report.

## anti-hallucination

`off` · `strict`

Six prohibitions, each with a concrete test, because "be accurate" is advice a
model already believes it is following.

1. Never state a file, function, flag, API, package, or config key exists until
   you have read it.
2. Never report the result of a command you did not run.
3. Cite `file:line` when describing existing behavior.
4. Do not invent version numbers, option names, error messages, or output.
5. "I do not know" is a complete answer.
6. When a tool result contradicts your expectation, the tool is right.

## tdd

`off` · `red-green` · `red-green-refactor`

The rule carrying the weight is that **a test you have not watched fail proves
nothing**. An agent that writes test and implementation together will report
green without ever establishing the test could go red, so the failing run is
required as `[O]` evidence.

Also: never edit a test to make a failing implementation pass, and a skipped or
commented out test is a failing test.

`red-green-refactor` adds the refactor step, run with tests green.

## review

`off` · `self` · `independent`

`self` asks for a second pass with the implementation reasoning set aside.

`independent` requires a reviewer with a fresh context and an explicitly set
model, because a model reviewing its own output shares its own blind spots. The
reviewer reports and does not edit. Findings carry a `file:line` and a concrete
failure scenario; a finding with no failure scenario is labeled an opinion.

This is the only family with a structural requirement, so it is the only one
whose validator does real work. See the invariant below.

## done

`off` · `checklist`

Injected at the end of the compiled skill, so it is the last thing read before
an agent decides whether to claim completion.

- Every acceptance criterion has `[O]` evidence
- No `[A]` claim in the completion report
- The full suite was run, not only the new tests, with output shown
- Every review finding resolved or deferred with a reason
- Anything skipped is named as skipped

---

## Invariants

Checks no single family can make, because each needs to see the whole
declaration. They are the difference between a linter and a compiler front end:
every one of these rejects a declaration that is valid line by line and
incoherent as a whole.

| Invariant | Why |
|---|---|
| `done` is not `off` requires `evidence` at `tagged` or better | The checklist asks for `[O]` evidence. A skill with no tag vocabulary has no way to express it, so the checklist is decoration. |
| `tdd` is not `off` requires `evidence: strict` | The red step is only real if the failing run is shown. Without strict evidence, "I wrote a failing test" is an unbacked claim. |
| `review: independent` requires a subagent capability in `allowed-tools` | A skill cannot promise an independent reviewer it has no way to spawn. |

## Versioning

`STANDARD_VERSION` in `src/standard/index.mjs` is bumped when injected prose or
invariants change. Every lockfile entry records the version it compiled against,
so `agentic list` can report an installed skill that predates a change:

```
develop  compiled against standard 1.0.0, current is 1.1.0
  fix: agentic update develop
```

Updating recompiles against the current standard. This is the normal way a
standard change reaches installed skills: the source may be byte identical and
the output still changes.
