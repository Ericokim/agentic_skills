# Spec: <decision or feature name>

**Status:** Decided | Assumed | Superseded
**Feature:** <scope feature number and name>
**Date:** <date>

> `Assumed` means this was built on without being ratified. It records what was
> assumed so the decision is not lost in a chat log. It does not block anyone
> from declaring work done.

## The decision

<One paragraph. What was chosen, stated plainly enough that someone can disagree
with it.>

## Why this and not the others

| Approach | Trade off | Verdict |
|----------|-----------|---------|
| <chosen>  | <cost accepted> | chosen |
| <other>   | <why not>       | rejected |

State the cost of the chosen approach honestly. A spec that lists only benefits
for the option that won is a decision nobody can revisit later.

## Acceptance criteria

The contract. Every later step traces back to this list, and each line has to be
provable by running something, not by reading the code and feeling reassured.

- [ ] <observable behavior, with the input that produces it>
- [ ] <observable behavior, with the input that produces it>

## Where every value comes from

Each value the feature must produce, and its source. A row with no source is an
undecided decision, and it belongs in Open questions until it has one.

| Value | Source | Notes |
|-------|--------|-------|
| <field> | <api, table, computed from X> | |

## Surfaces to build

<Pages, endpoints, jobs, or modules this decision requires. Named, so that a
verification pass can confirm each one exists.>

## Open questions

<Anything still undecided. Empty is a valid answer, and an honest empty is worth
more than a padded list.>
