---
status: accepted
date: 2026-10-25
---

# The LLM only sees public requirement text

The AI mapping feature sends the LLM API only the text of framework requirements. For KRITIS-Dachgesetz and NIS2 that text is a public statute. Tenant data (assets, risks, Evidence, Scopes) is never sent. That keeps the EU-only data rule from ADR 0005 intact even if the LLM provider processes requests outside the EU. Every suggested mapping is stored as a proposal and takes effect only after a GRC Manager approves it.

## Consequences

- Any AI feature that would need tenant data counts as a new decision: it needs an EU-hosted model or a superseding ADR.
- Licensed framework texts (e.g. ISO) may not go into prompts unless the license allows it.
