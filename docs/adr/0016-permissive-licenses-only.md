---
status: accepted
date: 2026-10-25
---

# Only permissively licensed dependencies; the product stays commercial

The product is built to be sold as a commercial SaaS, so no dependency may force it to be open-sourced or restrict commercial use. Allowed licenses: MIT, BSD, Apache-2.0, ISC, 0BSD, Unlicense, OFL (fonts). Allowed with conditions: MPL-2.0 (file-level copyleft, fine as long as those files are not modified) and LGPL (fine when the library is used unmodified, e.g. psycopg). Forbidden in anything shipped: GPL, AGPL, SSPL, BUSL/BSL, Commons Clause and any "non-commercial" license. GPL matters even for SaaS because frontend code is distributed to the browser, and AGPL is triggered by network use alone.

## Consequences

- CI runs a license check on Python and npm dependencies and fails on any forbidden license. New exceptions require an update to this ADR.
- Hosted services count too. Free plans that forbid commercial use (e.g. Vercel Hobby) are acceptable only for the non-commercial demo phase, and their commercial alternative must be documented.
- "Open core" component packages (e.g. paid grid or chart editions) are not used, even in their free tier, so licensing never blocks a commercial launch.
