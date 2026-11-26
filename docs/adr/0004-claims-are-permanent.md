# 0004. Claims are permanent; ownership is a per-Clan view

Status: accepted (owner, 2026-11-25, resolving "Claim lifecycle gaps", issue #2)

## Context
SPEC F9 scores a Claim per day held, F10 rots Exercise Score, and F14 ranks by "Lands currently owned". None of these says whether a Claim ever ends. The answer decides the data model: either one Claim per (user, Land, category), or Claims that one user can take from another, and maybe per Clan.

## Options considered
| Option | Pros | Cons |
|---|---|---|
| **Permanent Claims** | Reopens nothing in SPEC; Clans stay pure views; simplest model and queries | Travel never rots, so the first user to claim a Land by driving owns it for good against everyone who claims later |
| Another user's Loop ends your Claim (displacement) | Every Land can be contested, Travel included | If global: someone outside your Clans silently stops your Score, which breaks F15 and leaks that someone looped near you. If per Clan: a Claim per (user, Land, category, Clan), a much heavier model |
| Claim lapses after N days without a Visit | Inactive users drop out | A second decay mechanic on top of Rot |

## Decision
A Claim is permanent: one per (user, Land, category). It earns 1 Score per UTC calendar day, counting the claim day. A Claim belongs to the user, not to a Clan. Owner is computed per Clan from its members' Scores. Ties go to the earliest Claim, then the most recent Visit, then the lowest user id. Joining a Clan therefore brings in the user's whole history, and leaving removes it.

## Consequences
- Exercise ownership turns over through Rot: an unvisited Score peaks at about 194 near day 527 and then declines.
- Travel ownership goes to whoever claims first. This is accepted for v1 and tracked in `TODO.md`, to be revisited alongside the rot mechanism.
- Score can be derived from the claim date and today. Whether it is stored or computed on read is left to the scoring execution model.
