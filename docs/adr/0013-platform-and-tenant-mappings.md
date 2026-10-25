---
status: accepted
date: 2026-10-25
---

# Mappings are either platform-curated or tenant-owned, and never set a status

There are two kinds of Mapping. Platform Mappings are curated by the Platform Admin with a legal justification and are read-only for every Tenant. Tenant Mappings belong to one Tenant and become valid once that Tenant's GRC Manager approves them. AI Mapping Suggestions always become Tenant Mappings. A single global mapping table would have let one Tenant's GRC Manager change what every other Tenant sees.

Mappings are directional ("target is covered by source"), either full or partial, with a note describing any gap. A Mapping never changes an Implementation's status. It only suggests attaching Reference Evidence (one click for a full Mapping). Auditors expect a person to be accountable for every status, so the platform does not infer compliance automatically.

## Consequences

- Compliance % per Framework and Scope = (implemented + 0.5 × partial) / (all − not applicable).
