# Infrastructure

Everything that can be expressed as code lives in [`tofu/`](tofu/) (OpenTofu): Google Cloud (Cloud Run, jobs, schedules, Artifact Registry, Secret Manager, Workload Identity Federation, the budget alert) and Cloudflare (the R2 bucket and the DNS record). The rest is set up once by hand, following the checklists below. Local Postgres initialization lives in [`postgres/`](postgres/).

## What OpenTofu creates

| Area | Resources |
|---|---|
| Runtime | Cloud Run services `grc-backend` (public, concurrency 8) and `grc-risk-engine` (callable only by the API's service account), both `europe-west3`, scale 0–1 |
| Jobs | `grc-migrate` and `grc-demo-reset` (Cloud Run jobs, database owner role) |
| Schedules | Outbox drain every minute, Demo Tenant reset nightly at 03:00 Berlin time. Both are created **paused** and get enabled once their endpoints exist |
| Identity | One service account per workload; GitHub Actions authenticates with Workload Identity Federation, limited to this repository and to `main` for deployments. No keys exist |
| Secrets | Secret containers in Frankfurt only. **Values are never in code or state**; see "Secret values" |
| Images | Artifact Registry `grc` with immutable tags and a cleanup policy |
| Cost | A monthly budget alert (default €1). It notifies; it never stops spending. The hard cost ceiling is one instance per service |
| Storage | R2 bucket under the **EU jurisdiction**, private, no `r2.dev` address, CORS limited to the app origin |
| DNS | `grc.inomov.online` → Vercel, DNS only (not proxied) |

Releases change images through CD. OpenTofu ignores image changes after creation, so an apply never rolls a running release back.

## One-time bootstrap

Run these once, with your own account, before the first `tofu apply`.

1. **Google Cloud project** with billing linked. Then create the state bucket (versioned, Frankfurt):
   ```bash
   gcloud storage buckets create gs://<project-id>-tofu-state --location=europe-west3 --uniform-bucket-level-access --public-access-prevention
   gcloud storage buckets update gs://<project-id>-tofu-state --versioning
   ```
2. **Cloudflare API token** with exactly: *Account › Workers R2 Storage › Edit* and *Zone › DNS › Edit* for `inomov.online`. Export it as `CLOUDFLARE_API_TOKEN`; never write it to a file in the repository.
3. **Variables:** copy `tofu/demo.tfvars.example` to `tofu/demo.tfvars` and fill it in (git-ignored).
4. **Apply:**
   ```bash
   cd infra/tofu
   tofu init -backend-config="bucket=<project-id>-tofu-state"
   tofu plan -var-file=demo.tfvars -out=plan.tfplan
   tofu apply plan.tfplan
   ```

## Secret values

OpenTofu creates the secret containers; an operator adds the values, so they never reach a plan or the state file:

```bash
printf '%s' "<value>" | gcloud secrets versions add <secret-name> --data-file=-
```

| Secret | Value |
|---|---|
| `django-secret-key` | At least 50 random characters |
| `database-url-app` | Supabase **transaction pooler** URL (port 6543) for the `grc_app` role, `?sslmode=require` |
| `database-url-owner` | Supabase **direct/session** URL for the owner role, for migrations |
| `r2-access-key-id`, `r2-secret-access-key` | R2 API token scoped to the evidence bucket only (Object Read & Write) |
| `anthropic-api-key` | Claude API key for Mapping Suggestions (needed from M3) |

## Manual setup: Supabase

1. Create the project in **eu-central-1 (Frankfurt)** on the free plan.
2. **API settings: turn the Data API off.** Otherwise the tables would be reachable from the internet with the public anon key, bypassing Django.
3. In the SQL editor, create the application role the same way the local stack does (`postgres/initdb/10-app-role.sh`): `LOGIN`, `NOSUPERUSER`, `NOBYPASSRLS`, no `CREATE` on `public`, default privileges for data access on tables the owner creates.
4. Store both connection strings in Secret Manager (table above).

## Manual setup: Vercel

1. Import the repository, root directory `frontend/`, framework preset *Vite*, Node.js 24.x. Keep *Include files outside the root directory in the Build Step* on: the prototype build reads the demo fixtures from `seed/`.
2. **For the prototype, set the environment variables `VITE_API_MOCKING=enabled` and `ENABLE_EXPERIMENTAL_COREPACK=1`** (Production and Preview). With the first, the build contains the mock API, and every page shows the "Prototyp – Demodaten" badge; remove it once the real API is live.
3. `frontend/vercel.json` holds the build, the SPA fallback, caching and the security headers (the same as the nginx image). The `/api/*` rewrite and its caching opt-out are added with M0-08.
   - Install and build run through `corepack pnpm`, so the pnpm version pinned in `frontend/package.json` is used. Vercel's own pnpm is older and rejects the lockfile ("expected a single document"). Corepack's automatic switch-on looks for `packageManager` in the repository root, where there is no `package.json`, so it can't be relied on here.
4. **Domain.** Add `grc.inomov.online` to the project (`vercel domains add grc.inomov.online kritis-grc`). `inomov.online` is served by Cloudflare DNS, so the record is created there: a CNAME `grc` to the target `vercel domains verify grc.inomov.online` prints, **DNS only** (not proxied), because Vercel issues the certificate itself. OpenTofu manages the same record once it is applied; import an existing record before the first apply instead of creating a second one.
5. Git deployments stay on: every merge to `main` updates the prototype. Deploying from a local folder uploads everything the ignore rules let through, so export the tracked files first (`git archive HEAD`) instead of deploying from a working checkout.
6. The Hobby plan is non-commercial only, which fits the job-demo phase. A commercial launch moves to Vercel Pro, or to Cloudflare Pages with a Worker proxying `/api`.

## Checks

`tofu fmt -check`, `tofu validate`, TFLint (with the Google ruleset) and Trivy's misconfiguration scan run in CI on every change to `infra/`. `tofu plan` against the real project runs in CI once Workload Identity Federation is in place; `apply` is always run by a person.
