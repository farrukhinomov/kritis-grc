---
status: accepted
date: 2026-10-24
---

# Supabase is used only as managed Postgres

Supabase (free tier) hosts the database, but Supabase Auth, Row Level Security and the auto-generated Data API (PostgREST) are not used, and the Data API is switched off. Django is the only gatekeeper for authentication, authorization and tenant isolation. If the Data API stayed on, the anon key would expose the tables directly to the internet, bypassing Django.

## Consequences

- Leaving Supabase means moving to any other Postgres host. Only the connection strings change.
- Tenant isolation is enforced by Django, with Postgres RLS on Django's own connection as a second layer (ADR 0022). Supabase's RLS-through-PostgREST model stays unused.
