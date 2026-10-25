---
status: accepted
date: 2026-10-24
---

# All data stays in the EU, evidence files on Cloudflare R2

Every component that stores or processes data runs in the EU: Cloud Run in `europe-west3`, Supabase in `eu-central-1` (both Frankfurt). Vercel only serves the static SPA and proxies `/api`; it stores no data. Evidence files are stored in a private Cloudflare R2 bucket created under the EU jurisdiction. R2 was picked over Google Cloud Storage for its free egress and its S3-compatible API. The trade-off is a static, bucket-scoped API token kept in Secret Manager, where GCS would have allowed keyless service-account access. For a German GRC product, data residency is a requirement in its own right.

## Consequences

- R2's EU jurisdiction can only be set when a bucket is created. Moving to another jurisdiction means creating a new bucket and migrating the data.
- Any new service or vendor must be checked for EU hosting before it touches tenant data.
