# Documentation

| Document | What it answers | Changes when |
|---|---|---|
| [../GLOSSARY.md](../GLOSSARY.md) | What do our words mean? | A domain term is resolved or renamed |
| [scope.md](scope.md) | What is built in v1, in which order, and what isn't? | Scope or milestones change |
| [adr/](adr/README.md) | Why is it built this way? | A hard-to-reverse decision is made (new ADR, never a rewrite once code depends on it) |
| [conventions.md](conventions.md) | How do we build, test, deploy and secure it day to day? | An agreed rule changes, in the same PR as the code |
| [plan/](plan/README.md) | How do we get there: sequence, Definition of Done, backlog per milestone? | A milestone is planned or re-planned |
| [research/](research/) | What do the law and the libraries actually say? | Facts are re-checked (each file is dated, with sources) |
| [design/](design/) | Visual references | The design system changes |
| [../CLAUDE.md](../CLAUDE.md) | Rules for AI assistants | Any of the above changes in a way an assistant must know |

## Planned (created with the milestone that needs them)

| Document | Milestone |
|---|---|
| `security/threat-model.md` | M0 |
| `ai-log.md` | M0 |
| `events.md` (generated from event schemas) | M2 |
| `architecture.md` (C4 and event-flow diagrams in Mermaid) | M3 |

## Rules for this folder

- One topic per file. Link instead of repeating. If something is stated in two places, one of them is wrong.
- Research files carry the date they were checked, sources, and _(unverified)_ markers.
- Third-party material (screenshots, product texts) stays in `_docs/`, which is never committed.
