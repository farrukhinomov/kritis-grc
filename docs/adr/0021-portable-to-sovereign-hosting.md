---
status: accepted
date: 2026-10-25
---

# The system runs on any container platform

The demo runs on free tiers from US providers in EU regions (Cloud Run, Supabase, Vercel, Cloudflare R2). KRITIS customers often require German-sovereign hosting or on-premises installation, and EU regions of US providers still fall under the US CLOUD Act. The whole system therefore has to run on any container platform with only configuration changes. Every vendor-specific piece sits behind a replaceable interface:

| Demo | Portable replacement |
|---|---|
| Vercel (SPA + `/api` rewrite) | nginx serving the SPA and reverse-proxying `/api` |
| Cloud Run | any container runtime |
| Cloud Scheduler | any cron calling the HTTP endpoints |
| Supabase | any Postgres |
| Cloudflare R2 | any S3-compatible store |
| Secret Manager | environment variables |

## Consequences

- A production-like `docker compose` setup (nginx, Django, FastAPI, Postgres, SeaweedFS as the S3 store) is maintained and tested in CI. SeaweedFS (Apache-2.0) is used instead of MinIO, which is AGPL and was archived in April 2026.
- Tests mock S3 with moto. Local development uses a separate R2 dev bucket.
- No code may import a cloud vendor SDK outside an adapter module.
- The README states openly that the demo runs on free tiers and that a commercial KRITIS deployment would target sovereign hosting (e.g. STACKIT, IONOS, Hetzner, Open Telekom Cloud).
