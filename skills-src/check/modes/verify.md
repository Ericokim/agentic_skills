# Mode: verify

Runtime proof. Run the real application and watch the change behave.

Green tests and a clean build prove that code compiles and that assertions hold.
They do not prove the feature works, because a test only checks what someone
thought to check. This mode exists to close that gap, so it is worth nothing if
the app is not actually run.

## Steps

1. Read the spec's acceptance criteria. They are the checklist. If no spec
   exists, read the scope entry and say in the report that you verified against
   a looser contract.
2. Start the application using the command in AGENTS.md. If it does not start,
   that is the finding: stop and report it.
3. Drive each acceptance criterion through the real interface: the page, the
   endpoint, the command. Record the input you gave and the output you got.
4. Confirm every surface the spec names actually exists. A specced page that was
   never built is a silent failure, because nothing errors when it is missing.
5. Check the error paths the spec describes, not only the happy path.

## Evidence

Every criterion gets its command or interaction and the verbatim result. A
criterion you did not exercise is reported as not verified, never as passing.

Screenshots or response bodies where they carry the proof. A description of what
you believe happened is not proof.

## Verdict

PASS only when every acceptance criterion was exercised and met. Anything else
is FAIL with the specific gaps listed, or PARTIAL when some criteria could not
be exercised, with the reason each one could not.

Do not soften a FAIL because the cause looks small. The verdict describes
whether the change is proven, not how much work remains.

## Where failures go

Behavior that is wrong goes to `/debug`. A surface that was never built goes to
`/develop`. Say which, so the next step is unambiguous.
