# Deploying the server

v1 runs on Render in Oregon (ADR 0006). CI builds the image and Render runs it.

## How a deploy happens

1. A merge to `main` runs `.github/workflows/ci.yml`: lint, typecheck, migrations against a PostGIS service, a drift check on generated code, tests, build.
2. The `deploy` job builds `server/Dockerfile` (context: repo root), pushes `ghcr.io/knightseu/conquer-the-world-server:<sha>` and `:latest` to GHCR, then calls Render's deploy hook with `imgURL=` set to the `<sha>` image.
3. Render runs the pre-deploy command (`node-pg-migrate up`). Only if it succeeds does the new version start and take traffic once `/health` passes.

## One-time setup (owner)

1. Create a Render account and a Hobby workspace.
2. In Render, add a registry credential named `ghcr`: username = a GitHub user, password = a GitHub personal access token (classic) with `read:packages`. (Or make the GHCR package public, then drop `creds` from `render.yaml`.)
3. Push one image first (merge to `main` once; the deploy step is skipped without a hook and says so), then create the Blueprint from `render.yaml` in Render (New > Blueprint > this repo).
4. Copy the service's deploy hook URL (Settings > Deploy Hook) into the GitHub repo secret `RENDER_DEPLOY_HOOK_URL`.
5. Optional: set `SENTRY_DSN` on the service.

Check `render.yaml` field names against Render's Blueprint reference when you create it; it was written without access to a Render account.

## Environment

| Variable | Meaning |
|---|---|
| `DATABASE_URL` | Postgres connection string (from the Render database) |
| `PORT` | Set by Render |
| `APP_VERSION` | Baked into the image from the commit SHA |
| `SENTRY_DSN` | Optional error reporting |
| `DEBUG_ROUTES`, `ADMIN_TOKEN` | Debug pages; off in production by default |
| `RUN_WORKER` | `0` disables the in-process pg-boss worker |

## Local

```sh
docker compose up -d                 # PostGIS on localhost:5433
cd server
cp .env.example .env
pnpm install
DATABASE_URL=postgres://ctw:ctw@localhost:5433/ctw pnpm migrate
pnpm dev
```
