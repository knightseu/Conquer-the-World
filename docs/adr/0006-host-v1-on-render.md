# 0006. Host v1 on Render

Status: accepted

## Context
v1 needs one long-lived Node service, with a worker that runs even when idle, plus managed Postgres with PostGIS, in US West, for under about $25/month. Location data can't be recreated, so point-in-time restore (PITR) on the database matters most. Research on the `research/hosting` branch compared Render, Fly.io, Railway, Neon, Supabase, Google Cloud (Cloud Run, Cloud SQL, GCE) and AWS (Fargate, RDS, Lightsail): `docs/research/hosting-v1.md` and `docs/research/hosting-v1-gcp-aws.md`.

## Decision
- Render, Oregon region, Hobby workspace.
- One Starter web service ($7) runs the API and the pg-boss worker in one process.
- One Render Postgres ($6 tier plus storage) with PostGIS. h3-pg isn't available, so H3 work stays in Node with `h3-js`.
- GitHub Actions builds the Docker image, pushes it to GHCR and triggers Render's deploy hook with `imgURL=`.
- The pre-deploy command runs `node-pg-migrate up`, so migrations finish before the new version serves traffic.

## Consequences
- About $14/month, with 3-day PITR and services that never sleep.
- Rejected:
  - Fly.io: cheaper, but its small database has no PITR.
  - Railway: no PITR with the PostGIS image.
  - Cloud Run: ~$54/month, because the worker needs always-on CPU.
  - Fargate: needs a load balancer or gets an unstable IP.
  - A self-managed GCE VM: too much operations work.
  - Cloud credits: they expire before or during the beta.
- Upgrade path if longer PITR or h3-pg becomes a must:
  - a Render Pro workspace for 7-day PITR, or
  - move only the database to AWS RDS `db.t4g.micro` in `us-west-2` (PostGIS, h3-pg, up to 35 days of PITR) and keep the app on Render.
