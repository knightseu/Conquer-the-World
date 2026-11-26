# Research: Google Cloud and AWS for the v1 backend

Follow-up to [hosting-v1.md](hosting-v1.md), which recommends Render at about $14/month with 3-day PITR. Researched 2026-11-25 from each vendor's own docs, pricing pages, and (for AWS) the public Price List API files for `us-west-2`. Prices change often, so recheck them before you provision. Monthly figures use 730 hours unless noted.

## Requirements (same as the baseline)

- One long-lived Node 24 (Fastify) HTTP service, shipped as a Docker image built by GitHub Actions.
- A pg-boss worker in the same process, so the service needs CPU while idle (polling, scheduled jobs). No scale-to-zero, no CPU throttling between requests.
- Managed Postgres with PostGIS. h3-pg is nice to have, not required.
- **Point-in-time restore matters a lot**: location data can't be recreated.
- SQL migrations run before the new version serves traffic.
- US West, about 100 users, light traffic, under about $25/month in total.

## Comparison

| | Render (baseline) | GCP: Cloud Run + Cloud SQL | GCP: GCE e2-micro + Cloud SQL | AWS: ECS Fargate + RDS | AWS: Lightsail container + Lightsail DB | AWS: Lightsail container + RDS |
|---|---|---|---|---|---|---|
| Region | Oregon | `us-west1` Oregon (Tier 1) [G1] | `us-west1` (free tier region) [G9] | `us-west-2` Oregon | `us-west-2` | `us-west-2` |
| Smallest always-on app that keeps idle CPU | `0.5c-512mb` $7 | **1 vCPU** / 512 MiB, instance-based billing: about **$44.71** after free tier [G1][G2] | e2-micro free + external IPv4 **$3.65** [G9][G10] | 0.25 vCPU / 0.5 GB ARM **$7.21** + public IPv4 **$3.65**; ALB adds **$16.43** + LCUs [A5][A6][A7] | Nano 0.25 vCPU / 512 MB **$7** (HTTPS endpoint included) [A9] | Nano **$7** [A9] |
| Database | `0.1c-256mb` $6 + storage | `db-f1-micro` (shared, 0.6 GB) $7.67 + 10 GB SSD $1.70 + backups about $0.10-0.30: **about $9.50** [G4][G5] | same, **about $9.50** | `db.t4g.micro` (2 vCPU, 1 GiB) $11.68 + 20 GB gp3 $2.30: **$13.98**; backups free up to DB size [A1][A3] | 1 GB Standard bundle **$15** [A9] | **$13.98** + likely $3.65 public IPv4 (see gotchas) |
| **Total / month** | **about $14.30** | **about $54** | **about $13.20** | **about $24.84** with no load balancer; **about $41+** with an ALB | **about $22** | **about $24.60** |
| PostGIS | Yes | Yes (3.6.x) [G6] | Yes | Yes, 3.6.3 on PG 18.6 [A2] | **Not documented**; PG 12 to 16 only [A10] | Yes |
| h3-pg | No | No (not in the extension list) [G6] | No | **Yes**, h3-pg 4.2.3 on PG 13 to 18 [A2] | Not documented | Yes |
| PITR | 3 days (Hobby) | Yes on Enterprise edition, **1 to 7 days**, default 7 [G7] | same | Yes, retention **0 to 35 days**; logs shipped every 5 min [A3][A4] | Yes, **7 days**, 5-min increments [A11] | 0 to 35 days |
| Idle CPU / sleep gotchas | Paid never sleeps | Below 1 vCPU, Cloud Run **forces request-based billing** (CPU only during requests), concurrency 1, gen1 [G2] | None (it's a VM), but it's a tiny shared-core machine | None; Fargate tasks run until stopped | None documented | None documented |
| Deploy prebuilt image from GHA | Deploy hook with `imgURL` | `gcloud run deploy --image`, auth via Workload Identity Federation | Your own SSH/IAP + `docker pull` script | `aws ecs` task-definition update via OIDC role | `aws lightsail create-container-service-deployment` | same |
| Migrations before serving | Pre-deploy command | No hook: run a **Cloud Run job** with `gcloud run jobs execute --wait`, then deploy [G8] | Your script | No hook: `aws ecs run-task`, wait, check exit code, then update service | No hook; run them from GHA against the DB, or at container start | same |
| Ops overhead for a solo dev | Low | Medium: project, IAM, WIF, Artifact Registry, Cloud SQL connector | **High**: you patch the OS and run Docker, TLS, restarts | **High**: VPC, subnets, security groups, IAM roles, ECR, and either an ALB or a moving public IP | Low to medium | Medium |

## Google Cloud

### Cloud Run with an always-on instance

- **Billing modes.** Request-based billing charges only while an instance handles requests. Instance-based billing (formerly "CPU always allocated") charges for the whole instance lifetime and "allocates CPU even outside of request processing", which is what pg-boss needs [G2].
- **The catch: fractional CPU can't use instance-based billing.** The minimum is 0.08 vCPU, but below 1 vCPU "the billing settings must be set to request-based billing", concurrency must be 1, and you must use the first-generation execution environment [G2]. So the smallest pg-boss-compatible service is **1 vCPU**. Memory can be 512 MiB at 1 vCPU [G3].
- **Cost in `us-west1` (Tier 1).** Instance-based: $0.000018 per vCPU-second and $0.000002 per GiB-second. The free tier is 240,000 vCPU-seconds and 450,000 GiB-seconds per month [G1].
  - CPU: (2,628,000 − 240,000) s × $0.000018 = **$42.98**
  - Memory: (1,314,000 − 450,000) GiB-s × $0.000002 = **$1.73**
  - **About $44.71/month for compute alone**, nearly double the whole budget.
- **Cheaper Cloud Run options don't fit.** With request-based billing plus `min-instances=1`, the instance stays warm but its CPU is only allocated during requests [G2], so pg-boss polling and schedules stall. Cloud Run **worker pools** run continuous background work, but they don't serve HTTP, so you'd need a second service.
- **Migrations.** Cloud Run has no pre-deploy hook. The usual pattern is a Cloud Run job built from the same image: `gcloud run jobs execute migrate --wait --region us-west1`, then `gcloud run deploy` only if it succeeds [G8]. Jobs are billed at the instance-based rate with a 1-minute minimum [G1], which costs pennies.
- **Database connection.** `--add-cloudsql-instances` mounts the Cloud SQL connector (Unix socket) [G11]. You don't need a VPC.

### Cloud SQL for PostgreSQL, smallest tier

- **Shared-core tiers are Enterprise edition only.** `db-f1-micro` (0.614 GB) and `db-g1-small` (1.7 GB) belong to the "general purpose shared core" series, which only Enterprise edition offers [G12]. For PostgreSQL 16 and later the default edition is Enterprise Plus, and the console preselects it, so **choose Enterprise explicitly** [G13].
- **Price** (as shown on the pricing page's default region; `us-west1` is usually the same, but confirm in the calculator) [G4]:
  - `db-f1-micro`: $0.0105/h, so **$7.67/month**. `db-g1-small`: $0.035/h, so $25.55.
  - SSD storage: $0.000232877/GiB-hour, about **$0.17/GB-month**. The minimum is 10 GB, so $1.70 [G5][G14].
  - Backups: $0.000109589/GiB-hour, about $0.08/GB-month for what's used.
  - The $0.01/h IPv4 charge applies only while the instance is idle (stopped).
- **No SLA.** Shared-core machine types "are not covered by the Cloud SQL SLA" [G4].
- **PITR.** It's available on Enterprise edition with 1 to 7 days of transaction logs, default 7. Enterprise Plus allows 1 to 35 days (default 14), but has no shared-core tier [G7].
  - PITR is on by default only when you create the instance in the console. With gcloud, Terraform, or the API you must turn it on yourself (`--enable-point-in-time-recovery --retained-transaction-log-days=7`) [G7].
  - "Keeping more days of transaction logs requires a bigger storage size" [G7].
- **PostGIS:** yes, 3.6.x [G6]. **h3-pg: no**; it isn't in Cloud SQL's extension list [G6].
- **Connections.** The default `max_connections` is **25** on "tiny (~0.5 GB)" instances, which is `db-f1-micro`, and 50 on `db-g1-small` [G15]. That's enough for one API pool plus pg-boss, but keep the pools small.

### GCE e2-micro free tier (self-managed app, managed database)

- **What's free.** One non-preemptible e2-micro per month in `us-west1`, `us-central1`, or `us-east1`, plus 30 GB-months of standard persistent disk and 1 GB of egress from North America [G9].
- **Not free: the external IPv4 address.** It costs $0.005/h, about **$3.65/month**. The free tier covers only one hour a month [G10].
- **Total: about $13.20/month** with Cloud SQL `db-f1-micro`. That's the only GCP setup under budget, and it gives 7-day PITR.
- **Cost of the savings.** You run the VM yourself: OS patches, Docker, a process supervisor, TLS (for example Caddy), and an SSH or IAP deploy script that runs migrations and then restarts the container. You also connect to Cloud SQL yourself, through the Auth Proxy or a private IP (which needs Private Services Access). An e2-micro is a small shared-core VM with 1 GB of RAM.

## AWS

### RDS for PostgreSQL, `db.t4g.micro`

- **Price in `us-west-2`** (Price List API, effective 2026-11-01) [A1]:
  - Instance: $0.016/h Single-AZ, so **$11.68/month**.
  - gp3 or gp2 storage: $0.115/GB-month, so **$2.30** for 20 GB.
  - Backup storage: "no additional charge for backup storage up to 100% of your total database storage", then $0.095/GB-month [A1][A12].
- **PITR is the strongest option here.** Retention can be 0 to 35 days. The default is 7 in the console but **1 day from the CLI/API**, so set `--backup-retention-period` explicitly [A3]. Transaction logs are uploaded to S3 every five minutes, and you can restore to any point in the retention period [A4].
- **Extensions.** PostGIS 3.6.3 and **h3-pg 4.2.3** on PG 18.6 [A2]. h3-pg is also on PG 13 to 17. That's the only option in this note, and the baseline note too, besides Neon, with **managed PostGIS + h3-pg + PITR**.
- **Free tier for new accounts.** New accounts no longer get the old 12-month "750 hours of db.t4g.micro" deal. They get **up to $200 in credits over 6 months** [A8]. On the Free plan, "the account closes on its own 6 months after you open it or when your credits run out". Upgrade to the Paid plan to keep running, and keep the credits [A8][A13]. The RDS pricing page still describes the 12-month offer, which only applies to older accounts [A12]. The credits cover several months of this setup, but they aren't a lasting discount.
- **Public endpoint.** If the app runs outside the VPC (Lightsail, or anything external), the RDS endpoint needs a public IPv4, which costs $0.005/h ($3.65/month) [A6].

### ECS Fargate (app)

- **Smallest task.** 0.25 vCPU with 512 MiB [A5].
  - ARM: 0.25 × $0.03238 + 0.5 × $0.00356 = $0.009875/h, so **$7.21/month**.
  - x86: $9.01/month [A5][A1].
  - A Fargate task runs until it's stopped, so there's no idle throttling.
- **Getting traffic to it is the problem.**
  - **ALB:** $0.0225/h, so **$16.43/month**, plus $0.008 per LCU-hour [A7]. That alone puts the total at about $41 or more.
  - **No load balancer:** put the task in a public subnet with a public IP ($3.65/month [A6]). The task also needs a route to the internet to pull from ECR. The alternatives are a NAT gateway or ECR interface endpoints, which cost more [A14]. But a task's public IP changes on every deployment, so you'd need DNS-update automation and TLS inside the container. That's fragile and not a good trade for a solo developer.
- **Total without an ALB: about $24.84** ($7.21 + $3.65 + $13.98), right at the limit.
- **ECS Express Mode** is AWS's suggested replacement for App Runner. It provisions an ALB for you and shares it across Express services, but you still pay for the ALB [A15].
- **Migrations.** There's no hook. In GHA, run `aws ecs run-task` with the new task definition and a migrate command, then `aws ecs wait tasks-stopped`, check the container's exit code, and only then `aws ecs update-service`.
- **Overhead.** You set up a VPC, subnets, security groups (task to RDS on 5432), a task execution role, an OIDC deploy role for GHA, ECR, and CloudWatch Logs. It's the most setup of any option here.

### App Runner

**Closed to new customers.** "AWS App Runner is no longer open to new customers. Existing customers can continue to use the service as normal." AWS recommends ECS Express Mode instead [A16]. Skip it.

### Lightsail containers and Lightsail managed database

- **Containers.** Nano (0.25 vCPU, 512 MB) is $0.0094/h, so **$7/month**. Micro (1 GB) is $10 [A9]. Each container service includes a load balancer with HTTPS and a health-checked public endpoint, so there's no separate ALB or IPv4 charge [A17]. Nothing documents sleep or throttling.
- **Database.** The 1 GB Standard bundle is $0.0202/h, so **$15/month** [A9]. PITR is in **5-minute increments for the previous 7 days**, and it always restores to a new database [A11].
- **Weak points.**
  - PostgreSQL versions are **12 to 16 only** [A10].
  - **PostGIS isn't documented** anywhere in the Lightsail docs. Check with `SELECT * FROM pg_available_extension_versions WHERE name = 'postgis';` on a test instance before relying on it.
  - You can't add extensions yourself, and no h3-pg is documented.
- **Migrations.** There's no pre-deploy step. Run them from GHA against the database before `create-container-service-deployment`, or at container start. If a new deployment's containers fail to launch, Lightsail keeps the previous deployment active [A17].
- **Total: about $22.** It's simple to operate, but it only becomes a real option if PostGIS turns out to be available.
- **Lightsail container + RDS** (verified PostGIS and h3-pg, longer PITR) costs about $24.60 with a public RDS endpoint. I didn't verify whether Lightsail container services can reach RDS privately through Lightsail VPC peering, so plan on a public endpoint, TLS, and a strict security group.

## Does either beat Render?

**No, not for this case.** Render stays the recommendation.

Deciding facts:

1. **Cloud Run can't do cheap always-on CPU.** Instance-based billing needs at least 1 vCPU [G2], which is about $45/month before the database. Any configuration under 1 vCPU forces request-based billing, which starves pg-boss.
2. **Fargate needs either an ALB ($16.43/month [A7]) or a public IP that changes on every deploy.** With the ALB it costs about $41 or more. Without one it costs about $25 and is fragile.
3. **The options that fit the budget each give something up.**
   - *GCE e2-micro + Cloud SQL* (about $13.20) matches Render on price and gives **longer PITR (7 days vs 3)**, but you run the VM yourself, on a 0.6 GB shared-core database with no SLA and 25 connections.
   - *Lightsail* (about $22) is simple, but PostGIS isn't documented, and versions stop at PG 16.
   - *Lightsail + RDS* (about $24.60) hits the budget ceiling.
4. **What AWS does better is the database, not the price.** RDS `db.t4g.micro` is the best managed database in either note for this project: PostGIS, **h3-pg**, and PITR up to **35 days**, for about $14/month [A1][A2][A3]. If PITR length or h3-pg becomes a hard requirement, the strongest upgrade path is **Render web ($7) + RDS `db.t4g.micro` in `us-west-2` with a public endpoint (about $17.63)**, about $24.60 in total. Render's Oregon region is near `us-west-2`. You'd still use Render's pre-deploy command for migrations.

If PITR length matters more than ops time, raise Render's PITR first: Render Pro workspaces get 7 days, as noted in the baseline [R6 in hosting-v1.md]. Compare that workspace price against the Render + RDS option above.

## Sources

Google Cloud:
- [G1] https://cloud.google.com/run/pricing (instance-based and request-based tables, free tiers, Tier 1 region list, jobs billing)
- [G2] https://docs.cloud.google.com/run/docs/configuring/services/cpu ("If you use less than 1 vCPU ... Billing: must be set to request-based billing") and https://docs.cloud.google.com/run/docs/configuring/billing-settings
- [G3] https://docs.cloud.google.com/run/docs/configuring/services/memory-limits
- [G4] https://cloud.google.com/sql/pricing (shared-core prices, SLA note, storage, backups, IPv4 while idle)
- [G5] same page, storage and backup table
- [G6] https://docs.cloud.google.com/sql/docs/postgres/extensions
- [G7] https://docs.cloud.google.com/sql/docs/postgres/backup-recovery/configure-pitr
- [G8] https://docs.cloud.google.com/run/docs/execute/jobs
- [G9] https://docs.cloud.google.com/free/docs/free-cloud-features (Compute Engine free tier)
- [G10] https://cloud.google.com/vpc/network-pricing (external IP address pricing)
- [G11] https://docs.cloud.google.com/sql/docs/postgres/connect-run
- [G12] https://docs.cloud.google.com/sql/docs/postgres/machine-series-overview
- [G13] https://docs.cloud.google.com/sql/docs/postgres/editions-intro
- [G14] https://docs.cloud.google.com/sql/docs/postgres/instance-settings (minimum 10 GB storage)
- [G15] https://docs.cloud.google.com/sql/docs/postgres/flags (`max_connections` defaults by memory)

AWS:
- [A1] AWS Price List API, `us-west-2`, published 2026-11-24: https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/us-west-2/index.csv (and `AmazonECS`, `AmazonVPC`, `AWSELB`, `AmazonLightsail`, `AWSAppRunner` in the same path)
- [A2] https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html
- [A3] https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_WorkingWithAutomatedBackups.BackupRetention.html
- [A4] https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html
- [A5] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html (task CPU/memory sizes) and [A1] ECS file
- [A6] [A1] AmazonVPC file: "$0.005 per In-use public IPv4 address per hour"
- [A7] [A1] AWSELB file: "$0.0225 per Application LoadBalancer-hour", "$0.008 per used ... LCU-hour"
- [A8] https://aws.amazon.com/free/
- [A9] [A1] AmazonLightsail file (container nodes, database bundles)
- [A10] https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-choosing-a-database.html
- [A11] https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-creating-a-database-from-point-in-time-backup.html
- [A12] https://aws.amazon.com/rds/postgresql/pricing/
- [A13] https://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/free-tier-plans.html
- [A14] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-task-networking.html
- [A15] https://docs.aws.amazon.com/AmazonECS/latest/developerguide/express-service-overview.html
- [A16] https://docs.aws.amazon.com/apprunner/latest/dg/what-is-apprunner.html
- [A17] https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services-deployments.html
