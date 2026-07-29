# Postmortem: <what happened, in one line>

**Date:** <date of the incident>
**Duration:** <first effect to resolution>
**Impact:** <who was affected and how, in numbers where they exist>

## What happened

<A plain narrative. What broke, what people saw, what was done about it.>

## Timeline

| Time | Event |
|------|-------|
| <t>  | <what happened or was discovered> |

Include when it started, when it was noticed, and the gap between those two. The
gap is usually the most actionable number in the document.

## Root cause

<The actual cause, traced to the decision or change that introduced it. Not the
component where the error appeared.>

## Why it was not caught

<Which check would have caught this, and why it did not run or did not fail.
This section is the one that changes future outcomes.>

## What is being done

| Action | Owner | Status |
|--------|-------|--------|
| <specific change> | <who> | <state> |

Actions are specific and checkable. "Be more careful" is not an action; a test
that fails on this condition is.

## Notes on writing this

Blameless means the document explains why a reasonable person made the choice
they made, given what they could see at the time. It does not mean omitting what
happened. A postmortem that avoids naming the cause teaches nobody anything.
