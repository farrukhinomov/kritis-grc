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

---

## P-01 Design system and app shell (2026-10-25)

### Accepted
- **Review findings that were real bugs**, fixed with a test each where jsdom allows:
  - A swiped card could rest half-open: the animation target didn't change, so the card stayed where the finger left it, with its actions visible but inert. It now always settles at one end.
  - Switching Tenants carried object IDs from one Tenant into the other's URL. Only the screen carries over now.
  - A Tenant link that redirects to its dashboard counted as a navigation and stole focus on page load.
  - Closing the "More" sheet by choosing a screen returned focus to "More" instead of the new page's heading.
  - The drill-down dropped focus to the page body when its back button disappeared.
  - Buttons that changed their label *and* exposed a pressed/expanded state were announced contradictorily.

### Changed
- **The sampled brand green fails contrast.** White text on the reference primary is 4.1:1. The Saar Green Theme uses a darker primary for fills (5.6:1) and keeps the sampled color for the focus ring, where 3:1 suffices. The contrast test found it before any screen did.
- **The vendor chunk for Ant Design.** The existing build grouped all of antd into one long-cached chunk. With the shell, that group pulled every component any lazy page uses into the first download (334 KB, over the 300 KB budget). antd is now split by usage, Motion loads its features lazily, and the Tenant shell is a lazy route: 252 KB, below the 272 KB before this change.
- **CSS Modules.** Under `noUncheckedIndexedAccess` every module class is `string | undefined`. Prefixed global classes (`grc-shell-*`), as antd itself does, keep the type checks strict without a code generator.

### Rejected
- **"The bottom sheet may keep antd's dragged size"** (review). Checked in the Drawer source: a controlled `size` always wins over the internal one, so it can't stick. The real defect was the opposite, the sheet not following the finger during a drag, which is fixed.
- **"Report caught render errors from the error boundary"** (review). Deferred: the frontend has no telemetry by design, and `console` is banned in app code. Revisit when error reporting gets its own decision.
- **"Lint CSS files for raw colors too"** (review). Deferred: style sheets only reference `var(--grc-*)` today, and adding Stylelint for one rule isn't worth a new tool yet.

### Lesson
- **Measure the bundle, don't assume it.** The obvious suspect (the antd group) explained a tenth of the growth; the shell being eager and Motion's full feature set explained the rest.

---

## P-02 Demo fixtures and mock API (2026-10-25)

### Accepted
- **Review findings that were real bugs**, each with a test that fails on the old code:
  - Lost update: the mock checked `If-Match` before reading the request body, so two saves of the same version could both succeed. The check now runs after the last `await`, in one synchronous step.
  - The Activity Log cursor was a position; new entries shifted it and repeated rows on "load more". It now names the last entry seen.
  - Invalid `limit`, `ordering` and `status` values were silently ignored instead of answered with 400, so a typo would look fine against the mock and fail against the backend.
  - The Idempotency-Key fingerprint depended on JSON key order; a retry with reordered keys would have been refused.
  - The extraction glued § 32 Abs. 1 Satz 2 BSIG onto the last list item. A seed test now rejects glued sentences in any statute text.
  - The development compose stack didn't mount `seed/`.

### Changed
- **Statute text from memory.** The first plan was to write the Requirement texts by hand. They are now extracted from gesetze-im-internet.de and sliced per numbered item, so the wording is verbatim; only the English summaries are ours.
- **A deprecated API in the AI's first draft.** The tests used `fetchQuery`, which TanStack Query 5.104 deprecates in favor of `query()`. The type-aware linter caught it.

### Rejected
- **"Show the simulation panel in the deployed prototype too"** (review). Rejected for now: the backlog asks for a development-only switch, and the public demo should show the product, not its test harness. The contract tests cover the failure states.
- **"Bound the idempotency store"** (review). Not worth it in an in-memory mock that resets with the page; the backend stores keys for 24 hours.

---

## P-03 Login with demo role picker (2026-10-25)

### Accepted
- **A real session, not a role switch.** The demo buttons call `POST /api/v1/auth/demo-login`, the gate reads `GET /api/v1/me`, and the mock enforces 401, 404 and 403 per Membership, so the screens meet the same answers the backend will give. The demo session constant left `shared/` for the mock: a build without mocks has no built-in user.
- **Roles follow the Membership.** The GRC Manager demo account is an Auditor in one showcase Tenant, so a test proves the UI asks the current Membership, not the user.
- **`useCan` is presentation only.** The mock refuses an Auditor's writes with 403 and logs nothing, so a write control someone forgets to hide fails loudly instead of quietly succeeding.
- **Review findings that were real defects**, each now covered by a test:
  - Nothing proved that login and logout clear the cache: deleting both `clear()` calls left every test green. Two tests now fail without them.
  - Logging out of a session that had already expired answered 401, showed "Abmelden ist fehlgeschlagen" and left the old page as `?next=`. A 401 on logout now counts as signed out, and running requests are cancelled before the login page loads.
  - A server error on a field the form doesn't have showed nothing, and every field error read "required". Unknown fields now raise the general alert, and the wording follows the error code.
  - The read-only explanation sat in a `title` attribute that keyboard and touch users never see. The badge is now a button with a tooltip on hover and focus, with a short label on phones.
  - Real signed-in users saw "Demo öffnen"; builds without mocks say "Zur Anwendung".

### Changed
- **"Lazy-load the session gate to keep the entry chunk small."** Measured: it made the initial JavaScript 1 KB larger, not smaller. The growth (252 → 257 KB gzipped) is `useQuery` and the auth client, which the public header needs anyway, so the gate stays eager.

### Rejected
- **"Let the password form accept the demo accounts with a published password."** A password printed on the login page teaches the wrong habit and duplicates the demo buttons. The form refuses every login with the same answer for known and unknown emails, and a hint in mock builds points to the demo logins.

---

## P-04 Dashboard (2026-10-25)

### Accepted
- **Aggregates on the server.** The first idea was to compute the compliance bars from the Implementation list. That works for 46 rows and breaks at the 100-item page cap, so the mock now offers the summary endpoint and the filters the backend will have to provide, and the contract tests pin them down.
- **Only "implemented" counts.** Counting partial work as half would make a facility look further along than an auditor would accept. Partial work is shown as its own segment of the bar.
- **Unrated risks never sort as harmless.** Without a Residual Rating a risk goes to the end of the top-five list in inherent order, and the matrix says how many risks are still waiting.

- **Review findings that were real defects**, each with a test:
  - Numbers that go silently wrong past the seed's size: the matrix and the compliance summary were built from the first page of a list (25 or 100 items), and the activity and "my Implementations" widgets named people and Requirements from the first page of the member and Requirement lists. Both aggregates are now unpaged server objects, the activity entry carries `actor_name`, and the five Implementations look up their own Requirement and Scope.
  - 199 of 200 implemented showed "100 %". The percentage now rounds down.
  - A failed background refresh replaced good numbers with an error. The widget now keeps its data and says it is not current.
  - "Try again" after a render error re-rendered the same cached data and failed forever. It now drops that card's queries first.
  - The matrix category was color only, and the "projected" caveat lived in a hover title. Both are now written out.
  - "in 0 Tagen" now reads "heute fällig"; an empty status filter is ignored as in Django; unrated risks sorting among rated ones has its own test.

### Changed
- **Two layout bugs only a browser showed.** A `nowrap` in the "my Implementations" list made the page scroll sideways at 390 px and at 1440 px, and a generic table-cell rule hid the risk colors in the matrix. Both were found in headless screenshots, not in tests.

### Rejected
- **"Color empty matrix cells by the category they would have."** That needs the risk method's 4×4 table in the frontend, a copy of the risk engine's logic that could drift from it. Only occupied cells are colored, by the risks actually in them.

---

## Load only the active UI language (#35, 2026-10-25)

### Accepted
- **German stays bundled, English loads on demand.** German is the default, the fallback when a load fails and the typed source of every key, so it can't be lazy. English texts and Ant Design's English locale load together, before i18next switches, so no screen ever shows two languages.
- **No new dependency.** The loader is a ten-line i18next backend, the pattern the i18next docs describe; the official plugin would add a package for the same lines.

- **Review findings that were real defects**, each with a test that fails without its fix:
  - A failed English load still switched i18next to "en": the page claimed English while showing German, dates and Requirement titles turned English, and the switch offered no way back. A single `selectLanguage` now loads first and switches only on success; the user is told when English isn't available.
  - Reporting the failure as final turned off i18next's retries and blocked English until a full reload. Failures now retry twice, and every new attempt forces a fresh load.
  - Startup waited for the language without a limit, so a stalled request meant a blank page. Rendering now waits at most 3 seconds.
  - The initial German language overwrote a remembered English choice whenever English failed at startup. Only a successful switch is remembered now.
- **Tests that share i18next's instance were order-dependent.** `vi.resetModules()` re-runs the module but keeps i18next itself, so a second copy replaced the first one's loader. Startup is now a function applied to a fresh instance per test.

### Changed
- **The saving is smaller today than estimated.** Measured: 261 → 260 KB gzipped, not the ~4 KB guessed. Ant Design already ships English as its built-in default, so its locale file saves only about 1 KB. The point is the trend: from now on every screen's English text stays out of the first download.

---

## P-05 Compliance cockpit (2026-10-25)

### Accepted
- **The place lives in the URL.** "Without losing my place" means a reload, a shared link and the back button all return to the same paragraph and Requirement. Each drill-down is a history entry, so the phone's native back gesture works without a custom swipe handler.
- **Switching facility keeps the place, switching Framework starts over.** The same paragraph in another facility is a direct comparison; another Framework has different paragraphs.
- **Counts from the server again.** Paragraph counts come from `/compliance-paragraphs`, and the owner's name is embedded in the Implementation, for the same page-cap reasons as on the dashboard.
- **One tab stop per column.** Arrow keys move within and between columns, Home and End jump to the ends, Tab leaves the cockpit. A tab stop per row would make the page tedious to cross by keyboard.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - The in-app back button replaced the URL and left the level's own history entry behind, so the next back gesture changed nothing. After a drill-down it now goes back in history; only a deep link without a parent entry shortens the URL in place.
  - Levels from a link that don't exist (an old Requirement ID) stayed in the URL, and back needed two presses. They are dropped.
  - Switching facility collapsed the columns until the new counts arrived. The previous facility's data stays on screen meanwhile.
  - An arrow-key move into a column that failed or was empty stayed pending and later took focus from a mouse click.
  - Any key press inside the stack counted as "the user changed the level", so a later change from the facility picker moved focus to a title about to disappear. Only opening or closing a level counts now, and only for a moment.
  - "§ 8a" sorted as "§ 8"; paragraphs now compare numerically with letters after the number.
  - The cockpit took the version with the latest date even if it lay in the future. It now takes the latest one in force.

### Changed
- **Focus stole from the page on a deep link.** The drill-down moved focus to the deepest title whenever its depth changed, including while a deep link's columns loaded. Only a change the user caused moves focus now. Found in a headless screenshot.
- **Accessible names ran together** ("§ 13 Abs. 1Resilienzmaßnahmen"), which screen readers would read the same way. Found by a test query, fixed with spaces in the markup.

### Rejected
- **"Add an in-app swipe-right gesture for going back."** The browser's own back gesture already returns one level because every level is a history entry; a second, custom gesture would compete with it on iOS.
- **"Arrow right into the last column."** It holds no controls yet, so there is nothing to focus; right arrow on a Requirement opens its detail and keeps focus on the list.

---

## P-06 Implementation drawer (2026-10-25)

### Accepted
- **A full Mapping in the seed, as a Tenant Mapping.** The seed had no full Mapping, so the one-click reference would never have appeared. A Platform Mapping claiming full coverage would be a legal statement for every Tenant; a Tenant Mapping rests on that Tenant's own facts (one personnel-security process for plants and IT), which is how "full" can honestly arise.
- **The real upload flow, even in the mock.** Slot with a 5-minute URL, PUT to storage, Evidence created with the upload's ID, and the stored file checked against what was announced. A shortcut that posts the file to the API would hide the part that breaks in production.
- **Only full Mappings are suggested.** A partial one leaves part of the Requirement uncovered, so the other Implementation alone could never prove it.
- **The status control stays locked while a save is pending.** A second change would carry the old version and fail as a conflict with oneself.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - Switching tabs marked a deep link's entry as the drawer's own, so closing went back to the page before the cockpit. Switching now keeps the entry as it was.
  - Closing the drawer dropped focus on the page body. Focus returns to the button that opened it.
  - A second file picked during an upload could be overtaken by the first, and closing the drawer didn't stop an upload whose URL was still being issued. Only the newest upload may report back, and every upload is cancelled with the form.
  - All Evidence forms shared one save, so a failed link showed its error under the file form. Each form and suggestion has its own.
  - The Idempotency-Key lived for the whole form, so a corrected retry after a lost response was refused as a reused key. A key now belongs to one payload.
  - The mock trusted the browser's file type, which comes from the name; a web page renamed to .pdf passed. The stored file's first bytes now have to match, and each upload URL takes one PUT. The threat model says the same for the backend.
  - One stored address that didn't parse broke the whole Evidence list. Non-web addresses are shown as text.
  - A spy from one test leaked into the next. Mocks are now restored after every test.

### Changed
- **The conflict dialog was a `modal.warning()`.** It had no accessible name. A regular Modal names the dialog by its title.
- **Two tests passed with their feature removed** (found by mutation checks): the rollback test, because the refetch after the 412 restored the status anyway, and the file-limit test, because the server's 422 showed the same message. They now run with latency and assert that nothing was sent.

### Rejected
- **"Use antd's Upload.Dragger."** Its file input has no label and its list duplicates our own. A native file input over the drop zone keeps keyboard access, and the browser accepts dropped files on it without extra handlers.
- **"Show upload progress steps in the mock."** The mock's service worker receives the body locally in one step, so only 0 and 100 % appear. Faking intermediate steps would test the fake, not the code; against real storage XMLHttpRequest reports real progress.
