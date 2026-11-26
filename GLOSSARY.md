# Glossary

Domain language for MyLand (`myland/`). Use these terms in code, issues and docs.

| Term | Definition | Avoid |
|---|---|---|
| **Land** | A fixed map cell: an H3 hexagon at resolution 10 (~65 m edge). The unit that is claimed and owned. | tile, parcel, territory |
| **Track** | One continuous recording session from start to stop: a time-ordered list of GPS points. | trip, route, run |
| **Segment** | A part of a Track with a single movement type. | leg, split |
| **Movement type** | One of walk, run, hike, cycle, drive. Classified automatically from speed and motion data; user-correctable. | mode, activity |
| **Exercise score** | Score from walking, running, hiking and cycling. Never expires but rots, per Land. | |
| **Travel score** | Score from driving. Separate from Exercise score. Does not rot. | |
| **Rot** | Decay of an Exercise score on a Land not revisited; provisionally half after 1 year. | expire |
| **Loop** | A Track portion whose path returns near an earlier point and so encloses an area. | circuit, lap |
| **Claim** | A user's relationship to a Land, created when a Loop encloses it. Accrues score over time. | capture |
| **Score** | A user's accumulated points on a Land in one category (Exercise or Travel), grown per day held. | points |
| **Owner** | The user with the highest Score on a Land within a Clan, per category. | holder, king |
| **Clan** | A set of users sharing a map and leaderboards. | group, team |
| **Parcel** | A real-world named place made of Lands. Designed for, but not in v1. | |
| **Leaderboard** | Per-Clan ranking of users, one for Exercising and one for Traveling, by Lands owned or Score. | |

See `myland/SPEC.md` for requirements.
