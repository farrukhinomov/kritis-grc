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

---

## P-07 Risk explorer (2026-10-25)

### Accepted
- **The matrix and the list read the chosen rating on the server.** `/risk-matrix` and `/risks` take `rating`, a category and a cell, so the cell counts and the table always agree and no page has to be fetched whole to filter it.
- **`pending` only for the Residual Rating.** The Inherent and Target Ratings are entered by people and never wait for the risk engine; the mock refuses `pending` for them with a 400 instead of returning an empty list that looks like an answer.
- **The glide happens in the risk's own detail.** The explorer's matrix shows counts, not risks, so nothing could move there. In the detail each rating is a marker in a 4×4 grid, and marking a Treatment's Implementation as implemented moves the Residual marker to its new cell through a shared layout animation. Reduced motion turns it into a jump, and the legend says every rating as text.
- **The status mutation moved to `shared/`.** The risk detail and the Implementation drawer change a status the same way: optimistic, rolled back on error, 412 dialog, then risks and the Activity Log refetched.
- **Partial work has its own effect text.** The method counts partial work for half a level, so "planned 2" alone would overstate what is already in effect.
- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - Closing the risk detail or the cell sheet dropped focus on the page body, because both leave with their URL parameter. Focus returns to the risk's title or the cell that opened them.
  - On phones a cell's sheet replaced the history entry, so the back gesture left the explorer. It is now its own entry, and closing it goes back.
  - The cell sheet had no loading, error or empty state. It goes through the same four states as every other area.
  - With the risk engine down, an implemented Treatment read "would lower … once implemented". Without a Residual Rating the effect now says it is pending.
  - A shared link with a page past the end showed an empty list without a pager. It moves to the last page.
  - A cell with one risk was announced as "1 Risiken". Cell names have plural forms and name the cell's category.
  - The marker glide took twice the longest motion token. It uses the token.
  - The category filter, history replacement and page reset had no UI test, and the count assertions matched substrings. All are covered, and counts are checked in the cell's accessible name.

### Changed
- **The matrix sat beside the table.** In the browser check the six-column table pushed the page sideways even at 1920 px, because the content width is capped. The matrix now sits above the table, Scope and Hazard moved under the title, and every table scrolls inside its own box if it is still too wide.
- **Fact lists and secondary text were styled per feature.** The risk detail used the cockpit's classes, whose sheet its chunk never loads, so the list showed browser defaults. Both moved to the shared pattern sheet.

---

## P-08 Mapping-suggestion review (2026-10-25)

### Accepted
- **No optimistic decision.** Approving creates a Tenant Mapping, a statement about the Tenant's compliance. The card moves only once the server has agreed; until then its button shows that the decision is being saved.
- **A confirmation for both decisions.** Neither can be undone from the UI, and on phones a decision sits one swipe away.
- **The move happens in one batch.** In the browser check the card jumped instead of gliding, because each cached list notified on its own and the card left one list a render before it reached the other. Updating all lists in one notification batch fixed it; a test holds the refetch back to prove the card moves on the confirmation alone.
- **Pending suggestions in statute order.** A reviewer works through the law; ordering by the model's confidence would present a hint as a ranking.
- **Suggestions name both Requirements and who decided.** The review then needs no catalogue lists, and a decision states its author, as the Activity Log does.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - A second decision while the first was saving lost the first one's feedback and unlocked its buttons, and on phones the same card could be decided again, ending in a 409 about one's own decision. One decision runs at a time, and every card's actions are locked meanwhile.
  - The announcement and the focus move waited for three reloads, so focus fell to the page body. They now run on the server's confirmation, in the hook, for every decision.
  - Deciding the last card on a later page showed "no pending suggestions" without a pager. The list moves back to its last page.
  - Two decisions of the same kind were announced once, because the message didn't change. It names the Requirement.
  - After a 409, focus fell to the page body. It moves on as after a decision, and the card leaves all lists until the reload shows where it went, so it can't appear in two at once.
  - Totals on other cached pages weren't adjusted, and cards with the same target had the same accessible name. Both fixed; the name adds the source.
  - The 409 test passed without the reload, and the Auditor was only tested on a wide screen. The 409 test now has someone else decide for real, and the Auditor is tested on a phone too.

### Rejected
- **"Keep the dialog's decision while it closes."** It doesn't reproduce: the dialog component freezes its whole panel while closing, so the title and buttons never switch. A test written for it passed with and without the change, so neither was kept.

### Changed
- **Focus moved to the next card with scrolling.** The scroll pulled the gliding card out of view. Focus now moves without scrolling; the neighbour is already in view.
- **The plain-list style lived in the risk explorer's sheet.** The review page showed bullets. It moved to the shared pattern sheet.

---

## P-09 Applicability Check (2026-10-25)

### Accepted
- **The rule lives on the server.** The wizard sends Sector, Critical Service and the number of people supplied, and words the structured answer. A threshold compared in the browser would be a second copy of a legal rule.
- **Only verified law is cited.** The research note gives § 2 Nr. 3 (definition), § 4 Abs. 1 (sectors) and § 5 Abs. 2 (default threshold of 500,000); § 8 Abs. 1 (registration within three months) is quoted verbatim in the seed's Requirement text. A suggested reference to a designation in individual cases came from secondary sources only and was left out.
- **Reaching the threshold counts.** That is how the IT security ordinance words its thresholds; whether the KRITIS ordinance will say the same is open while it is a draft. The rule sits in one place in the mock, marked as the one to check when the ordinance is in force.
- **Every result is preliminary.** The thresholds ordinance is a draft, so the default threshold is a guide and there is no duty to register yet; the result says so in its own box, which is a note, not an alert.
- **All ten sectors are shown, only water is selectable.** The law's list stays visible, and one sentence says the prototype has thresholds for water only, instead of a hint under every option.
- **The facility is created with a planned Registration.** Its deadlines come from the server and are labelled as projected.
- **One Idempotency-Key helper for every creating POST in the mock**, shared by Evidence and Critical Facilities, and one key hook in `shared/lib`.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - The default Registration date came from UTC, so shortly after midnight it was a day early, and 30 November plus three months rolled into March. It is now the local date with the month end kept, the same calculation the deadlines use.
  - The pre-filled date read as if the three-month period were already running, next to a note saying there is no duty to register yet. The date is labelled as an assumption, and the period is said to start only once the ordinance makes the facility critical.
  - Focus fell to the page at every step. It moves to each step's question and, once loaded, to the verdict.
  - A failing catalogue left every sector disabled without an explanation. The step has loading, error and retry states.
  - "Change answers" after creating a facility could create the same facility again. After creating, only a new check is offered.
  - The mock accepted a confirmed Registration, a facility below the threshold and a date in the past. All three are refused, and the form refuses past dates too.
  - Every keystroke renewed the Idempotency-Key, so a retry after a lost answer could create a second facility once a trimmed space was typed. The key now changes only when what is sent changes.
  - Field errors from the server showed as a general failure. They appear at their fields.
  - The focus test passed with the focus code removed, because the page body contains every text. It checks the focused element itself.

### Changed
- **The four steps took a phone's whole first screen.** Phones get one line instead ("Schritt 2 von 4: …").
- **"§" broke from its number at line ends.** Citations in the explanation keep their spaces unbreakable.
- **Focus fell to the page after creating the facility.** It moves to the heading that replaced the form.

---

## P-10 Command palette (2026-10-25)

### Accepted
- **Search on the server.** Requirements, Risks and Assets are searched by `/search` inside the Tenant and come back in capped groups with totals, as aggregates do. Loading every list to filter it in the browser would grow with the Tenant and could not be checked for isolation.
- **Pages are matched in the browser**, in the interface language, so "Betroffenheit" and "Applicability" both find the page, and pages stay findable when the search fails.
- **Citations match however they are spaced.** "§13 abs.3" finds "§ 13 Abs. 3"; text matches ignore case and accents.
- **The palette lives in the shell**, next to the navigation it complements, not in a feature module.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - Enter could open a hit of an earlier query while the new one was on its way. Hits become choosable only once they answer what is in the field; until then they are shown as in progress.
  - Requirement hits opened the cockpit in its first Scope, where the Requirement might not apply, and a Tenant without Implementations got hits that led nowhere. Hits now come only from Requirements the Tenant applies and carry the Scope to open.
  - A query of punctuation, such as ". .", matched every citation. Only a query with a number is compared as a citation.
  - On a Mac, Ctrl+K deletes to the end of the line in text fields; the shortcut took it over. Apple keyboards use Cmd+K only, others Ctrl+K only, and Shift, Alt and composing input are left alone.
  - The shortcut opened the palette over another dialog, whose work a page change would discard. It waits until no other dialog is open.
  - The dialog had no accessible name; the hidden heading named nothing. The dialog's own title names it and is hidden visually only.
  - After choosing a result, the dialog moved focus back to the trigger, away from the new page's heading. It returns focus only when closed with Escape.
  - The active option could sit out of view, Enter confirmed an input method's word as a choice, Home and End no longer moved the caret, a click on the list took focus from the input, an empty listbox stayed referenced, one-letter page filtering was never announced, and the header button was under 44 px on touch tablets. All fixed.
  - Two tests passed without their feature: the IME test checked the URL before the page's code could load, and the dialog-name check could not resolve antd's test ids. Both now check what they claim.

### Rejected
- **"Use cmdk."** A small own combobox follows the WAI-ARIA pattern exactly (focus stays in the input, options via aria-activedescendant, groups with names) and adds nothing to the bundle; the library's value is mostly fuzzy ranking, which the server does here.

---

## P-15 Standard screens (2026-10-25)

### Accepted
- **Facilities and Assets keep their place in the URL.** The chosen Scope and an open Asset (`?scope=…&asset=…`) are what the command palette links to; opening an Asset is a history entry, so the back gesture closes it, and focus returns to its name.
- **An Asset shows what it depends on, what depends on it, and the risks that name it**, the last from `/risks?asset=…` on the server.
- **The Activity Log reads by cursor with filters in the URL.** More entries load when the end scrolls into view and on a button, for keyboards and browsers without an intersection observer.
- **The Theme belongs to the Tenant, the light or dark mode to the user.** The session now carries each Tenant's current Theme, so a change in settings reaches the shell through the same path as at sign-in.
- **One formatter for changed fields.** The drawer's history and the Activity Log both say "Status: offen → teilweise umgesetzt", never stored values.
- **The route-error test fails a real page.** It used to rely on a placeholder page, and after this step none is left.

- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - The Asset detail named only dependencies in the same Scope; the grid connection both plants depend on sits in the organization's Scope and showed as "none". The detail looks dependencies up across the Tenant.
  - After a failed "load more", every settled fetch built a new observer that fetched again, without end. One observer lives as long as the end marker, reads the current state and never retries a failure; the button does.
  - Any failed reload of the session replaced the whole app with an error panel, though a valid session was cached. Only a session that never loaded stops the app now (found while testing the Theme change).
  - After a Theme change whose session reload failed, the choice jumped back while the status said it was saved. The saved Theme goes into the session at once.
  - A broken Asset link crashed the page on closing the detail, as the URL value went into a selector; focus fell to the page when the Asset wasn't listed. Values are compared instead, and focus falls back to the Asset list's heading.
  - Asset names and the Scope buttons were under 44 px on touch screens; the default Scope went into the URL; choosing the current Theme again logged a change; a stale success message survived a later failure; a docstring sat on the wrong function.

### Rejected
- **"Use one word for approving in the log and in the suggestion's state."** "freigegeben" is what someone did, the action of the log, which also covers Risk Assessments; "angenommen" is the state a Mapping Suggestion is in. They are different things and read correctly where each appears.

### Changed
- **A long Scope name stretched its card and the page.** The button now reads "Assets anzeigen" and carries the Scope in its accessible name, which starts with the visible text.
- **The Activity Log showed stored values** ("open → partial", "inherent_impact"). It uses the shared formatter.

---

## P-11 Approvals inbox (2026-10-25)

### Accepted
- **Risk Assessments enter the seed.** The glossary defines them as dated, approved reviews of a Critical Facility's Risks; one is submitted and waiting, one approved. The seed test checks that approvals come from someone other than the author.
- **Four eyes on Risk Assessments.** Whoever submitted an assessment can't approve or reject it; the server refuses with `own_submission`, and the inbox doesn't offer it to them.
- **A rejection needs a reason.** It goes back to the author, who has to know what to rework.
- **One inbox across modules.** `/approvals` gathers Mapping Suggestions and Risk Assessments, oldest first, and its total feeds the navigation's badge, so the count and the list can't disagree.
- **The badge says its number in words.** The digit is hidden from screen readers; the link reads "Freigaben, 5 offen".
- **An approved Risk Assessment is due again four years after its date**, calculated on read, as the law asks for one at least every four years.
- **Review findings that were real defects**, each with a test that fails without its fix (mutation-checked):
  - Decisions on the suggestions page didn't reach the inbox or the badge; deciding a listed Suggestion again then read as "decided by someone else". The suggestions page refreshes the approvals too.
  - A decided item stayed until the inbox reloaded, with its buttons enabled again. Like the suggestions page, the inbox now takes it out of the cache in one step once the server agrees.
  - The dialog gave focus back to the decided card's button, which left with the card. Focus moves to the next item, and only after a success.
  - Risk Assessment entries in the Activity Log had no type and an untranslated status. Statuses are now translated per kind of object, since "approved" means "angenommen" for a Suggestion and "freigegeben" for an assessment.
  - Submission dates were the UTC day; they are the user's own day now.
  - The hidden count text took room in the sidebar and pushed the badge out of the collapsed rail; on the active item the badge disappeared into the pill. Both fixed in the shell's styles.
  - The Auditor text promised a list that never comes, the card links were under 44 px on phones, a rejection without reason answered 422 where 404, 409 or 403 apply first, and the Suggestion's card said "Freigeben" while its dialog said "annehmen". All fixed.

### Rejected
- **"Keep the dialog's content while it closes."** As found in P-08, the dialog component freezes its panel while closing, so the content doesn't change.


---

## P-12 Deadlines timeline (2026-10-26)

### Accepted
- **One aggregate for every deadline.** `/deadlines` lists the four duties that start with each facility's Registration and the renewal of its latest approved Risk Assessment. The dashboard widget reads it too, so the two screens can't disagree.
- **A renewal binds only as much as the facility's duties do.** Each deadline follows the facility's Registration: projected while it's planned, binding once it's confirmed.
- **The timeline is an overview, and the list is the content.** On wide screens, markers sit in lanes per facility on a scale of whole years with a line for today. Each marker is a link to its list entry, so no information exists only in a tooltip. On phones, and for screen readers, the list is the whole page.
- **Deadlines of one facility that fall on one day share a marker** that names all their citations, since at this scale they would sit on top of each other.

### Rejected
- **"Show a label next to every marker."** Deadlines a month apart are a few pixels apart at this scale, so the labels would overlap. The marker's accessible name and its list entry carry the text.
