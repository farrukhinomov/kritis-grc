# AI log

How AI is used to build this project, and where its output was accepted, changed or rejected. It's written per milestone, so the judgment behind the code stays visible: AI writes much of the code, a person decides what ships.

## How AI is used

| Activity | Tool | Human control |
|---|---|---|
| Design interviews (one decision tree per topic) | Claude Code | Every decision answered by the maintainer; recorded in GLOSSARY, ADRs and conventions |
| Fact checks (laws, library versions, licenses) | Claude Code research subagents | Facts saved with sources and *(unverified)* markers in `docs/research/` |
| Implementation, test-first | Claude Code | Tests written before code; every check must pass before a commit |
| Code review | Review subagents during development; the AI review workflow on pull requests | Findings are verified against the code and fixed test-first, or rejected with a reason below |
| Other assistants | Copilot, Cursor and AGENTS.md-aware tools | Same rules: generated from `CLAUDE.md` |

## Entry format

Each milestone gets one entry with four parts:
- **Accepted:** AI suggestions that were adopted, if notable.
- **Changed:** AI output that was right in direction but wrong in detail, and how it was caught.
- **Rejected:** suggestions that were turned down, with the reason.
- **Lesson:** what changes in how AI is used afterwards.

---

## M0 Walking skeleton (2026-10-25)

### Accepted
- **Review findings that were real bugs**, each reproduced in a test before the fix:
  - Query strings leaked into Django's error logs through the serialized request object.
  - `APP_ENV` defaulted to `local`, so a missing variable in production would have turned on debug pages.
  - A 500 in the risk engine lost its request ID because the framework's error handler ran after the middleware had cleaned up.
  - A 405 response dropped the `Allow` header that HTTP requires.
  - The status page hid checks the server didn't report.
- **Defense in depth suggested during the stack review:** Postgres row-level security as a second layer of tenant isolation, and django-pghistory triggers instead of hand-written Activity Log calls.

### Changed
- **Health probes inside the per-request transaction.** The first version of the probes ran inside `ATOMIC_REQUESTS`, so a database outage would have produced an unhandled 500 instead of a clean 503. A test caught it, and the probes moved into middleware ahead of transactions and host checks.
- **An outdated library API.** The generated test setup used MSW 2's `onUnhandledRequest`, which MSW 3 silently ignores. The tests passed without their safety net. TypeScript's strict check caught it.
- **"Latest version" isn't always right.** TypeScript 7 and ESLint 10 were the newest releases, but typescript-eslint and the accessibility plugin don't support them yet. Both were held back, with the reason recorded in the conventions.
- **The Postgres health check.** It probed the local socket, which answers during the image's first initialization, before the real server is up. The first fresh start failed. It now probes over TCP and was verified on a fresh volume.
- **Image scanning found what code review didn't.** Trivy reported fixable high/critical CVEs vendored inside the base image's `pip` and in an outdated nginx tag. The fix was to remove `pip` from the runtime images and move to the stable nginx line with OS patches applied at build.

### Rejected
- **"Gate mocks to development builds only"** (frontend review). Rejected: the prototype milestone deploys *with* mock data on purpose. Instead, a build without the flag was verified to contain no mock code.
- **"`includeSubDomains` pins sibling subdomains to HTTPS"** (backend review). Rejected as factually wrong: the header covers subdomains *of* the sending host, not its siblings.
- **"Use a finite gunicorn timeout to reclaim hung threads"** (backend review). Rejected: `gthread` workers don't reclaim individual threads that way, and Google recommends `timeout 0` on Cloud Run. Cloud Run's concurrency is set to gunicorn's thread count instead.
- **"Use `uvicorn[standard]` for speed"** (risk engine review). Rejected: the service is internal and low-traffic, and the extra event loop doesn't run on the Windows development machine.
- **The official Trivy GitHub Action.** Avoided because that action had a supply-chain compromise in 2026. Scanners run as digest-pinned containers instead.

### Lesson
- **Treat the AI's knowledge of library APIs and versions as a hypothesis.** Verify against the installed package or its changelog, and let strict type checks and linters catch the rest.
- **Every review finding gets a reproducing test before it's fixed**, and every rejection gets a written reason. About a third of review findings were rejected or narrowed.
