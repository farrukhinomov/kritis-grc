# Backlog: M3 AI and polish

Week 7 of [scope.md](../scope.md): Mapping Suggestions with approval and an eval set, the nightly Demo Tenant reset, and the presentation (README, diagrams, demo video). Same format as [backlog-m2.md](backlog-m2.md): each item maps one to one to a GitHub Issue, estimates are hours of focused work.

## Ground rules for M3

- **The prototype is the contract**, as before. `mapping-suggestions` and its approve and reject actions match the MSW handlers.
- **The LLM only sees public statute text** ([ADR 0007](../adr/0007-llm-sees-only-public-requirement-text.md)). The request to the model is built from Requirements alone; no Tenant, Scope or person appears in it, and a test proves that.
- **The model proposes, a person decides.** A suggestion never changes a Mapping or an Implementation until a GRC Manager approves it.
- **The model call lives in the stateless FastAPI service** ([ADR 0001](../adr/0001-django-owns-all-data-fastapi-is-stateless.md)). Django owns the suggestions, the daily call cap and the decision.
- **Evals cost money and run on prompt changes, not on every PR.** Tests use a stand-in held to the service's contract; the eval uses the real model and needs an API key.
- **Stretch (Resilience Plan) only if time is left.**

## Budget

About **17 h** against 20 h for week 7.

---

### M3-01 Mapping Suggestions: review and decide
**Labels:** `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 3 h · **Depends on:** M1-04, M2-05

As a GRC Manager, I want to approve or reject suggested Mappings, so that only Mappings I vouch for count.

- [ ] Tenant-owned `MappingSuggestion` (target and source Requirement, coverage, confidence, German and English rationale, model, status, who decided and when). One suggestion per pair and Tenant.
- [ ] `mapping-suggestions` (filter `status`; pending first in statute order, then latest decisions). `approve` creates the Tenant Mapping (201) in the same transaction; `reject` answers the suggestion. Deciding twice is 409 `suggestion_already_decided`.
- [ ] The approvals inbox lists pending suggestions next to Risk Assessments. Decisions appear in the Activity Log. The seed loads the four demo suggestions.

### M3-02 Suggestions from the model
**Labels:** `module:ai`, `module:compliance`, `type:feature`, `prio:must` · **Estimate:** 4 h · **Depends on:** M3-01

As a GRC Manager, I want suggested overlaps between the KRITIS-Dachgesetz and the BSIG, so that I don't have to compare 30 paragraphs by hand.

- [ ] FastAPI `POST /v1/mapping-suggestions:generate`: one target Requirement and the candidate Requirements (citation and text only) in, suggestions out. Claude Sonnet 5.5 with structured output; the candidate list is cached across calls. Citations outside the candidates are discarded; only full and partial coverage are returned. No API key: 503.
- [ ] Django `manage.py suggest_mappings <tenant>`: one call per KRITIS-DachG Requirement without a Mapping or open suggestion, a daily call cap per Tenant, idempotent, and a test that the request carries no tenant data.
- [ ] Client in `grc.compliance` held to the service's committed OpenAPI contract, like the risk engine's.

### M3-03 Eval set for Mapping Suggestions
**Labels:** `module:ai`, `type:test`, `prio:must` · **Estimate:** 3 h · **Depends on:** M3-02

As the maintainer, I want precision and recall of the suggestions measured, so that a prompt change is judged by numbers.

- [ ] Gold set: the Platform Mappings (positives with coverage) plus known non-overlaps (negatives), versioned in the repository.
- [ ] `uv run python -m risk_engine.eval` calls the real model and reports precision and recall overall and per coverage level, with the cost of the run.
- [ ] A workflow runs it when the prompt or the gold set changes, or on demand; the latest result goes into the README.

### M3-04 Nightly Demo Tenant reset
**Labels:** `module:demo`, `type:feature`, `prio:must` · **Estimate:** 2.5 h · **Depends on:** M2-06

As a visitor, I want the demo in its original state every morning, so that I see the intended story and not yesterday's experiments.

- [ ] `manage.py reset_demo`: in one transaction, purge every row of the Demo Tenant (the Activity Log only through its purge switch), delete its stored files, and reload the fixtures. Refuses any Tenant that isn't a demo.
- [ ] Logins of demo visitors are ended. Other Tenants are untouched, which a test proves.
- [ ] The compose stacks can run it; in the cloud, Cloud Scheduler calls it (M0-08).

### M3-05 README, diagrams and demo script
**Labels:** `type:docs`, `prio:must` · **Estimate:** 4.5 h · **Depends on:** M3-01 to M3-04

As a reviewer, I want to understand the product, the architecture and the decisions in ten minutes, so that I can judge the work.

- [ ] README in the order of conventions.md: pitch, demo link and logins, GIF, architecture, key decisions, AI workflow with eval results, `docker compose up`, badges.
- [ ] Mermaid diagrams: C4 context and container, and the event flow from a status change to the moved Risk.
- [ ] The 3-minute demo: German narration script with English subtitles (SRT) and a reproducible screen recording of the v1 flow. Recording the voice is the maintainer's.
- [ ] `docs/ai-log.md` updated for M1 to M3.
