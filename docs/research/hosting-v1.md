# Research: where to host the v1 backend

Researched 2026-11-25 from each vendor's own docs and pricing pages. Prices change often, so recheck them before you provision.

## Requirements

- One long-lived Node 24 (Fastify) HTTP service, shipped as a Docker image built by GitHub Actions on merge to `main`.
- Managed Postgres with PostGIS. h3-pg is preferred, but h3-js in Node is acceptable.
- SQL migrations run before the new version starts.
- A daily cron job, plus a pg-boss worker that can share the API process.
- US West, about 100 users, light traffic, under about $25/month in total.

## Comparison

| | Render (web + Render Postgres) | Fly.io (app + Fly MPG) | Railway (app + PostGIS template) | App + Neon | App + Supabase |
|---|---|---|---|---|---|
| US West | Oregon [R1] | `sjc`, `lax`; both host MPG [F1] | `us-west2`, California [W1] | `aws-us-west-2`, Oregon [N1] | `us-west-1` N. California, `us-west-2` Oregon [S1] |
| PostGIS | Yes [R2] | Yes; turn it on at creation or later on v2 clusters [F2] | Only through a marketplace template, not the default Postgres [W2] | Yes, 3.3 to 3.7 depending on PG version [N2] | Yes [S2] |
| h3-pg | Not listed [R2] | Not listed [F2] | You'd have to build a custom image | **Yes**, `h3` + `h3_postgis` on PG14 to 18 [N2] | No. The request was closed without adding it [S3] |
| Smallest always-on cost | Web `0.5c-512mb` $7 + PG `0.1c-256mb` $6 + storage $0.30/GB + cron $1 minimum, Hobby workspace $0: **about $14.30** [R3][R4] | VM shared-1x 512MB $3.69 + MPG Developer $4: **about $8**. The next MPG tier (Basic) is $38 [F3][F4] | Hobby $5 including $5 of usage, then about $10 per GB-month of RAM and $20 per vCPU-month of actual use: **roughly $5 to $10** (my estimate) [W3] | Launch plan: 0.25 CU always on = 0.25 x 730 h x $0.106 = **about $19.35** + $0.35/GB, plus the app host [N3] | Pro $25 with $10 credit covering Micro: **about $25 for the database alone**, plus the app host [S4] |
| Sleep / cold starts | Paid services don't sleep. Free sleeps after 15 min, about 1 min to wake [R5] | `auto_stop_machines` defaults to `"off"` [F5]. The Developer database pauses after 15 min with no connections [F6] | Sleep is opt-in ("Serverless"), and any outbound packets, including DB connections, keep a service awake [W4] | Launch suspends after 5 min, but you can turn that off. On Free you can't [N3] | Free projects pause after 1 week of inactivity. Paid projects never pause [S4] |
| Backups / PITR at that tier | PITR on all paid databases: 3 days on Hobby, 7 on Pro. Logical exports kept 7 days [R6] | Developer: 1 daily backup kept 1 day, **no PITR** [F6] | Volume backups (daily kept 6 days, and so on) [W5]. PITR and HA need the official image; **the PostGIS template isn't supported** [W6] | Launch: history up to 7 days [N3] | Daily backups kept 7 days. PITR costs $100/month per 7 days [S4] |
| Deploy a prebuilt image from GHA | Deploy hook with `imgURL=` set to a tag or digest. Image services don't auto-redeploy [R7] | `flyctl deploy --image ...` with a deploy token [F7][F8] | Push a mutable tag, then `railway redeploy --service X --yes`. No documented wait-for-status [W7] | n/a (database only) | n/a (database only) |
| Migrations before start | Pre-deploy command: paid services only, separate instance, 30-min limit, a failure keeps the old deploy [R8]. Works for image services [R7] | `release_command`: temporary machine with secrets, non-zero exit aborts, 5-min default timeout [F5] | Pre-deploy command: separate container on the private network, a failure stops the deploy [W8] | Run it from the app host's hook over a **direct** (non-pooled) connection [N4] | Run it from the app host's hook |
| Cron | Native cron service, $1/month minimum, UTC, at most one run at a time, can use a prebuilt image [R4] | Scheduled Machines (hourly/daily/weekly/monthly only, not precise), Supercronic, or Cron Manager [F9] | Native cron service, UTC, at least 5 min apart, a run is skipped if the previous one is still going [W9] | n/a. Use pg-boss `schedule` or the app host | Has `pg_cron`. Otherwise use pg-boss |
| Connections | 100 below 8 GB RAM [R9] | Developer: 20 direct, no PgBouncer [F6] | Plain Postgres; you configure it yourself | 0.25 CU: 105 usable, pooler holds 10k clients. Transaction mode breaks LISTEN/NOTIFY and session advisory locks [N4] | Micro: 60 direct, 200 pooler [S5] |
| Egress | Hobby includes 5 GB, then $0.15/GB [R3] | NA $0.02/GB [F3] | $0.05/GB [W3] | Launch includes 500 GB, then $0.10/GB [N3] | Includes 250 GB, then $0.09/GB [S4] |

## Gotchas

- **Fly MPG Developer** is aimed at "side projects, prototypes and small apps". It has 20 connections, no pooler, 5 GB maximum storage including WAL, no direct support, and maintenance "at any time". It pauses after 15 minutes with no connections, but a pg-boss process polling all the time keeps it awake. The next tier, Basic, costs $38/month and breaks the budget [F4][F6]. Fly's listed VM prices are for `iad` and `ewr`, the cheapest regions, so `sjc` and `lax` may cost slightly more [F3]. Note that Railway's comparison page says Fly MPG has "10 days of PITR on every plan". Fly's own Developer-plan page contradicts that, and these notes follow Fly.
- **Railway**: putting PostGIS on Railway means running a custom image. That gives up the "managed" features (PITR, HA conversion), and changing the template "makes the database yours to manage" [W2][W6]. Hobby volumes are capped at 5 GB [W10]. Railway's docs don't say which plans get backups; forum answers conflict.
- **Neon**: pg-boss polls, so in practice the compute never scales to zero. The Free plan's 100 CU-hours (0.25 CU x 730 h = 182 CU-h) runs out partway through the month, which means paying for Launch. pg-boss uses advisory locks and LISTEN, so point it and migrations at the direct endpoint, not the pooler [N3][N4]. The app host and database are on different providers, so every query crosses the network.
- **Supabase**: the Pro plan alone is about $25. Free has no backups and a 500 MB limit [S4]. There's no h3-pg [S3].
- **Render**: the 256 MB Postgres is small but adequate for 100 users. Free Postgres expires after 30 days and has no backups [R5]. The pre-deploy command doesn't exist on Free web services [R8]. Adding a disk to a service turns off zero-downtime deploys, but a stateless API doesn't need one [R8].

## Recommendation

**Render**: a `0.5c-512mb` web service running the API and the pg-boss worker in one process, a `0.1c-256mb` Render Postgres with PostGIS, and one cron job service. All of it goes in Oregon on a Hobby workspace, for about $14 to $15/month.

What decides it:
1. It's the only option under $25 that gives **PITR** on a managed PostGIS database. Hobby gets a 3-day window, plus logical exports kept 7 days [R6]. Fly's database at this price has 1-day backups and no PITR. Railway's PostGIS template can't use PITR.
2. Every required feature is built in: pre-deploy for migrations [R8], a deploy hook that takes `imgURL` for images built in GitHub Actions [R7], native cron [R4], and paid services never sleep [R5].
3. It leaves about $10 of headroom. You can move up to the $19 1 GB database [R3] without breaking the budget.

Use h3-js in Node, since Render lists no h3-pg [R2]. If h3-pg becomes a hard requirement, the fallback is the Render (or Fly) app plus **Neon Launch** in `aws-us-west-2`. That's about $19.35 for the database plus $3.69 to $7 for the app, so about $23 to $27, right at the budget limit [N2][N3].

Runner-up on cost: **Fly** at about $8/month. Choose it only if you're willing to accept the Developer plan's limits on backups and support.

## Sources

- [R1] https://render.com/docs/regions
- [R2] https://render.com/docs/postgresql-extensions
- [R3] https://render.com/pricing
- [R4] https://render.com/docs/cronjobs
- [R5] https://render.com/docs/free
- [R6] https://render.com/docs/postgresql-backups
- [R7] https://render.com/docs/deploy-an-image
- [R8] https://render.com/docs/deploys
- [R9] https://render.com/docs/postgresql-creating-connecting
- [F1] https://docs.fly.io/reference/regions
- [F2] https://docs.fly.io/postgres/extensions
- [F3] https://docs.fly.io/about/pricing
- [F4] https://docs.fly.io/mpg
- [F5] https://docs.fly.io/reference/configuration (`[deploy] release_command`, `auto_stop_machines`)
- [F6] https://docs.fly.io/postgres/developer-plan
- [F7] https://docs.fly.io/flyctl/deploy/
- [F8] https://docs.fly.io/launch/continuous-deployment-with-github-actions/
- [F9] https://docs.fly.io/blueprints/task-scheduling/
- [W1] https://docs.railway.com/reference/deployment-regions
- [W2] https://docs.railway.com/guides/postgresql (Extensions section)
- [W3] https://railway.com/pricing
- [W4] https://docs.railway.com/reference/app-sleeping
- [W5] https://docs.railway.com/volumes/backups
- [W6] https://docs.railway.com/volumes/point-in-time-recovery and https://docs.railway.com/databases/postgresql-ha (Prerequisites: "Custom images (e.g. PostGIS, TimescaleDB) are not compatible")
- [W7] https://docs.railway.com/guides/private-container-registry
- [W8] https://docs.railway.com/guides/pre-deploy-command
- [W9] https://docs.railway.com/reference/cron-jobs
- [W10] https://docs.railway.com/reference/pricing/plans
- [N1] https://neon.com/docs/introduction/regions
- [N2] https://neon.com/docs/extensions/pg-extensions
- [N3] https://neon.com/pricing
- [N4] https://neon.com/docs/connect/connection-pooling
- [S1] https://supabase.com/docs/guides/platform/regions
- [S2] https://supabase.com/docs/guides/database/extensions/postgis
- [S3] https://github.com/supabase/postgres/issues/664 (closed 2024-08-07, moved to the extension-voting discussion; `nix/ext` in supabase/postgres has no h3)
- [S4] https://supabase.com/pricing
- [S5] https://supabase.com/docs/guides/platform/compute-and-disk
