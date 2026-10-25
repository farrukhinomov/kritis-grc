# Scope and timeline (v1)

Budget: about 20 hours/week for 7 weeks. The application goes out once the prototype (milestone P) is live, and work continues in public afterwards. The product is designed as a commercial SaaS. The repo is public under a proprietary, evaluation-only license, and all dependencies follow [ADR 0016](adr/0016-permissive-licenses-only.md).

## The flow v1 is built around

1. Log in as **GRC Manager** in the Demo Tenant "Muster-Stadtwerke Saar GmbH" (fictional, sector Wasser).
2. Open the **KRITIS-DachG cockpit** for the Critical Facility "Wasserwerk Nord". Deadlines are projected from its planned Registration.
3. Open an Implementation and attach **Reference Evidence** pointing to the existing NIS2 (BSIG 2025) Implementation, plus one File Evidence.
4. Set the status to "implemented". The **Residual Rating updates** (the risk visibly moves in the matrix) and the **dashboard** reflects it.
5. Log in as **Auditor** and see every change in the **Activity Log**, without edit rights.

The flow works on desktop, tablet and phone.

## Domain content in v1
- **KRITIS-DachG** (one Framework Version), modelled from the statute: §§ 8, 12, 13 Abs. 1/3/4, 16, 18, 20. That's roughly 15–20 Requirements grouped by paragraph, with Pending Legal Detail where an ordinance or template is still missing.
- **NIS2 (BSIG 2025)**: § 30 Abs. 2 Nr. 1–10 plus §§ 31, 32, 33, 39.
- Seeded Platform Mappings: § 12↔§ 30 Nr. 1, § 13 BCM↔§ 30 Nr. 3, § 13 personnel↔§ 30 Nr. 9, § 13 training↔§ 30 Nr. 7, § 18↔§ 32, § 8↔§ 33, § 16↔§ 39.
- Two Critical Facilities ("Wasserwerk Nord", "Wasserwerk Süd"), each with Assets, a **planned** Registration with projected deadlines, and Risks built from a seeded Hazard catalogue. Nobody can register until the thresholds ordinance is in force, so a confirmed date would be legally wrong.
- The Hazard catalogue is our own all-hazards sample (natural / technical / human-made), labelled "sample catalogue, to be replaced by national risk analysis" and editable per Tenant. The § 11 national risk analyses are not public.
- Each Requirement stores the verbatim German statute text plus a short English summary we write. Identifiers are the legal citations (e.g. `§ 13 Abs. 3 Nr. 2`) in every UI language.
- All demo content lives in one shared `seed/` JSON fixture set, served by MSW in the prototype and loaded by the Django seed command later.

Legal background: [research/kritis-dachg-legal-facts.md](research/kritis-dachg-legal-facts.md).

## Milestones
| Milestone | Week | Content |
|---|---|---|
| M0 Walking skeleton | 1 | Monorepo, CI/CD, license check, a "hello" through Vercel → Django → FastAPI → Supabase → R2, `no-store` caching safeguard with its E2E test, production-like `docker compose` (nginx, SeaweedFS) |
| P Prototype | 2–4 | All screens below on MSW mock data, desktop + tablet + phone, labelled "Prototyp – Demodaten" on `grc.inomov.online`. **Application goes out.** |
| M1 Compliance core | 5 | The real API behind the main flow: login (allauth headless + demo login), Tenant/Membership/Scope/Critical Facility, both Frameworks, Implementations, Evidence, Activity Log, API Tokens, the API reference at `/api/ui` (Scalar), Impressum and privacy policy |
| M2 Risk and events | 6 | Outbox and domain events, Hazards/Risks/Risk Assessment, Residual Rating from FastAPI, dashboard with deadlines |
| M3 AI and polish | 7 | Mapping Suggestions with approval and eval set, nightly reset, README, diagrams, 3-minute demo video. Stretch: generated Resilience Plan |

Work is tracked as GitHub Issues (user stories with acceptance criteria, labelled by module) on a GitHub Projects board, one PR per issue.

## Screens in the prototype
**Full polish (become real in M1–M3):** Dashboard (six widgets), Compliance cockpit, Implementation drawer, Risk explorer, Mapping-suggestion review.

**Extra pro screens (prototype only in v1, real after v1):** Applicability Check ("Bin ich betroffen?"), command palette (Ctrl+K), approvals inbox, deadlines timeline, Asset dependency graph, KRITIS-DachG × BSIG coverage heatmap.

**Standard design:** Login with demo role picker, Facilities/Assets, Activity Log, Tenant settings (Theme), roadmap page.

## How it is built

UI/UX, API, testing and infrastructure rules are in [conventions.md](conventions.md). Rationale for the big decisions is in the [ADRs](adr/README.md).

## Out of scope for v1 (roadmap page)
- Management report / PDF export, Incident register with reporting timers (§ 18 KRITIS-DachG / § 32 BSIG), Resilience Plan document, Evidence library with expiry, policies with read acknowledgements, questionnaires, Audit workspace, notification center, Membership management UI, webhooks, SSO (OIDC/SAML).
- BCM emergency-plan planner, ESG, email/SMS notifications, user-editable dashboards.
- Quantitative (ALE) risk, DIN SPEC 27076.
- Self-service sign-up. Only the Demo Tenant and admin-created Tenants.
- Upgrade from Django 5.2 LTS to 6.2 LTS (due April 2027). Switch the outbox to `django.tasks` once it supports retries.
- Sector-specific special paths (e.g. § 5f EnWG for electricity/gas, exemptions in § 4 Abs. 2).
