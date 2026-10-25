# Demo fixtures

The content of the Demo Tenant "Muster-Stadtwerke Saar GmbH": two Critical Facilities, their Assets, both Frameworks, Implementations, Evidence, Hazards, Risks, Risk Assessments, Mappings, Mapping Suggestions and Activity Log entries. Everything is fictional and contains no personal data; addresses use `example.com`.

The same files feed the prototype's mock API (MSW) and, from M1, the Django seed command that restores the Demo Tenant every night.

| File | Content |
|---|---|
| `tenant.json` | The Demo Tenant |
| `users.json` | Its members and their roles |
| `frameworks.json` | KRITIS-Dachgesetz and NIS2 (BSIG 2025), one Framework Version each, with source and retrieval date |
| `requirements.json` | 16 KRITIS-DachG and 14 BSIG Requirements with verbatim statute text and an English summary |
| `scopes.json` | The organization and the two Critical Facilities with planned Registrations |
| `assets.json` | Assets with their dependencies |
| `implementations.json` | KRITIS-DachG per Critical Facility, BSIG for the organization |
| `evidence.json` | File, Link and Reference Evidence |
| `mappings.json` | The 7 Platform Mappings (all partial) and two approved Tenant Mappings, one of them full |
| `mapping-suggestions.json` | Pending Mapping Suggestions |
| `hazards.json` | Sample Hazard catalogue (natural, technical, human-made), to be replaced by the national risk analyses |
| `risks.json` | Risks with Inherent and Target Ratings and their Treatments |
| `risk-assessments.json` | Risk Assessments per Critical Facility: one submitted and waiting for approval, one approved |
| `activity.json` | Activity Log entries, oldest first |

## Rules

- Only stored values live here. What the server calculates (projected deadlines, scores, Residual Ratings) is derived on every read.
- The statute text is copied verbatim from gesetze-im-internet.de; German federal statutes are official works without copyright (§ 5 UrhG). Check the wording before a new Framework Version is added.
- IDs are stable, readable strings so the files can reference each other. Clients treat them as opaque.
- `frontend/src/mocks/seed.test.ts` checks every reference and enum value; run it after editing.
