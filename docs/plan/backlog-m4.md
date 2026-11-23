# Backlog: M4 Pro screens on the real API

After v1. The prototype's four pro screens work on MSW only; against Django they fail to load. This milestone gives each its real endpoint, so every screen of the demo runs on real data. Same format as [backlog-m3.md](backlog-m3.md); estimates are hours of focused work.

## Ground rules

- **The prototype is the contract**, as in M1 to M3: paths, parameters, field names and Problem Details match the MSW handlers in `frontend/src/mocks/handlers/`.
- **Reads only.** None of the four writes anything, so none needs the outbox or the Activity Log.
- **Aggregates, never pages,** where the screen needs everything at once (coverage matrix, dependency graph), so nothing can be cut off.
- **No LLM, no paid service.**

---

### M4-01 Applicability Check
**Labels:** `module:organization`, `type:feature`, `prio:should` · **Estimate:** 1.5 h

As a visitor, I want to know whether the KRITIS-Dachgesetz applies to a facility, with its legal basis, so that I know whether to register.

- [ ] `GET applicability-check?sector&critical_service&people_supplied`: applies when the threshold is reached; not binding while the thresholds ordinance is pending; the citations of definition, threshold and registration.
- [ ] An unknown Critical Service or a number that isn't whole: 400 `invalid_filter`.

### M4-02 Search for the command palette
**Labels:** `module:organization`, `type:feature`, `prio:should` · **Estimate:** 2.5 h

As a GRC Manager, I want to find a paragraph, a Risk or an Asset by typing, so that I get there without clicking through menus.

- [ ] `GET search?q` (at least 2 characters): Requirements the Tenant applies (citation before title before text, accent- and case-insensitive, "§13 abs.3" finds "§ 13 Abs. 3"), the Tenant's Risks and Assets; at most 5 per group with the total.
- [ ] Only what the actor may see: a Scope-limited Membership finds only its Scopes' work.

### M4-03 Coverage matrix
**Labels:** `module:compliance`, `type:feature`, `prio:should` · **Estimate:** 2.5 h

As a GRC Manager, I want to see where the BSIG already covers the KRITIS-Dachgesetz, and where one Implementation counts for both, so that I don't do the work twice.

- [ ] `GET coverage-matrix`: rows are the KRITIS-DachG Requirements, columns the BSIG ones, both of the version in force and in statute order; a cell per pair with an applying Mapping (Platform, or the Tenant's approved), rated by its strongest Mapping, the Tenant's own first.
- [ ] `reused_in`: the Scopes where a full Mapping applies and the facility's Implementation refers to an implemented BSIG one as Evidence. Totals.

### M4-04 Asset dependency graph
**Labels:** `module:assets`, `module:risk`, `type:feature`, `prio:should` · **Estimate:** 2.5 h

As a GRC Manager, I want to see what a facility depends on, up to the organization's shared Assets and suppliers, and how threatened each is, so that I find single points of failure.

- [ ] `GET dependency-graph?scope`: the facility's Assets and everything they depend on across Scopes, every edge with both ends in the graph, roots that cover every Asset even in a cycle.
- [ ] Each Asset's overlay counts only the facility's own Risks; its highest Residual Rating is unknown while any of them is pending.
- [ ] Not a Critical Facility, or not visible: 404. No `scope`: 400.

**Total:** about 9 h.
