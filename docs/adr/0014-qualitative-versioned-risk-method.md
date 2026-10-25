---
status: accepted
date: 2026-10-25
---

# Risks are rated on a fixed qualitative matrix by a versioned, deterministic method

Risks are rated on a 4×4 matrix. Likelihood runs selten / mittel / häufig / sehr häufig; impact runs vernachlässigbar / begrenzt / beträchtlich / existenzbedrohend, judged by the effect on the Critical Service (people affected, duration), not in euros. A person sets the Inherent and Target Ratings. The Residual Rating is calculated:

- Each Treatment whose Implementation is implemented lowers its dimension by its stated levels.
- A partial Implementation counts at half effect, rounded down.
- Ratings never drop below the lowest level.

The score is likelihood × impact (1–16). Its category is *low* up to 2, *medium* up to 4, *high* up to 8 and *critical* above that. Version `qualitative-4x4/1` defines exactly these rules.

The FastAPI service calculates this as a pure batch function and returns a `method_version` that Django stores with each result, so past scores can be reproduced after the method changes. Quantitative (ALE) assessment was rejected for v1: Critical Service impact is about people and duration, and euro estimates would be invented numbers in a demo.

## Consequences

- The matrix is fixed in v1, so Tenants cannot configure levels or thresholds.
- Changing the formula requires a new `method_version`. It never silently re-rates history.
