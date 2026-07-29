---
name: architect
description: "Run /architect when choosing between approaches, designing a feature or page, picking a stack, or when /develop says a decision is owed: anytime a load bearing technical decision is unmade. Asks deep questions, recommends an answer, and writes a build spec to docs/specs/ whose acceptance criteria are the contract. Owns all spec files."
allowed-tools: Bash, Read, Grep, Glob, Write, Edit, Agent, AskUserQuestion
argument-hint: "[the decision, feature, or page to design]"
standard:
  evidence: tagged
  anti-hallucination: strict
  tdd: off
  review: independent
  done: checklist
---

## What this skill does

Runs a real design conversation about one load bearing decision, then writes it
down as a build spec. The spec's acceptance criteria become the contract every
later step traces back to.

A decision is load bearing when changing it later means changing code in many
places: a stack, a data model, a provider, an auth boundary, a page design.
Decisions that are cheap to reverse do not need a spec.

## Asks vs acts

This skill asks. It is the one place in the workflow where a slow conversation
is the point, because a wrong decision here is paid for in every later step.

Ask one question at a time. Each carries a recommendation and a one line reason.
Never present a neutral menu, and never resolve a load bearing question silently
because the answer seems obvious.

## Artifact ownership

Owns `docs/specs/`. Writes nothing else, and never writes code.

## Execution

1. Name the decision in one sentence. If you cannot, the topic is too broad:
   split it and design the first piece.
2. Read the ground truth before proposing anything: AGENTS.md, the scope entry
   this serves, and the code the decision touches. Cite what you read.
3. Explore two or three real approaches. Each gets its trade offs stated
   honestly, including the one you are not recommending. An approach listed only
   to be dismissed is not an option, it is set dressing.
4. Recommend one, with the reason. Then let the engineer decide.
5. Name the source of every value the feature must produce. This is where gaps
   surface: a field with no source is an undecided decision wearing a design's
   clothes.
6. Write the spec from `spec-template.md` in this skill's folder.

## The cross check

For a decision with wide blast radius, offer an independent read of the finished
spec by a reviewer with a fresh context. Offer it, and let the engineer choose.

Whatever it finds is surfaced for the engineer to decide. Never applied
silently: a critique that quietly rewrites a decision the engineer made is worse
than no critique, because it hides where the design actually came from.

## Assumed specs

When `/develop` was overridden and built on an undecided design, an `Assumed`
spec exists. Ratifying it is this skill's job: confirm or correct the
assumption, then change its status.

An `Assumed` spec never blocks anyone from declaring work done. It is a standing
reminder, not a gate.

## Completion report

Lead with the decision made and where the spec lives. Name the acceptance
criteria count, since that is the contract. Raise unresolved questions only when
there are some.
