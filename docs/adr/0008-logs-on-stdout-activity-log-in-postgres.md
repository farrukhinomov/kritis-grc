---
status: accepted
date: 2026-10-25
---

# Operational logs go to stdout; the Activity Log lives in Postgres

To stay independent of any cloud vendor, both services write operational logs (requests, errors, latency) as structured JSON to stdout, with no vendor logging SDK in the code. Cloud Run happens to collect them today, but any platform can. Operational logs are deliberately kept out of Postgres: the Supabase free tier has 500 MB, logging would add a database write to every request, and the logs would be lost exactly when the database has trouble. The domain record of who changed what (the Activity Log) is different. It is product data that GRC Managers and Auditors read, so it is stored in Postgres.

## Consequences

- Do not add `google-cloud-logging` or a similar SDK. Log retention and search are the platform's job, not the code's.
- A request ID is passed from Vercel to Django to FastAPI and appears in every log line.
