# The Yes List: rolling worklist (scheduled sessions work from this)

Each scheduled session: take the first unchecked item, finish it end to end (built, tested, pushed, the
CI run green, live checked), tick it here with the date and commit, add a line to the log at the bottom,
then take the next one if there's time. Never leave a red CI run behind.

## Standing rules (from the owner)
- Exercise every change like a user would; grow the Playwright tap-through tests (apps/e2e) with each feature.
- Every screen: only what's needed up front; refinements in "More" / "Advanced".
- Every export (PDF, print, Excel) branded The Yes List with the event details, never plain, readable.
- No copyright or trade mark risk: no brand names, copied art, competitor look-alikes; open-licence fonts only;
  made-up sample names; no fabricated reviews or ratings. Australian owned and operated.
- Never say something is live until the CI run for it passed and the page was opened.
- Commit only your own paths (`git commit -m … -- <paths>`), then `git pull --rebase -q origin main && git push -q origin HEAD:main`.
  Never stash, reset or switch branches. Commit messages end with the Co-Authored-By line used in the repo.
- No local Node: CI is the build. Read results via the GitHub API (runs?head_sha=…, jobs, check-runs/<id>/annotations).
- Don't enter passwords or tokens, don't create accounts outside staging, don't spend money.

## Worklist (top first)
- [ ] 1. "Try the app" sandbox from the front page: a sample wedding's admin (made-up guests, tables, budget)
      running with no server writes, a Basic / Essentials / Deluxe switch showing what each plan adds
      (locked features shown with what they do), clear Back to the front page and Start your wedding buttons.
      Route /try. Tap-through test.
- [ ] 2. Staging test drive: deploy staging (push the main tip to refs/heads/staging), sign up a test couple
      on https://wedding-platform-nd-staging.pages.dev (sign-ups there get every feature), add guests and
      tables, move tables, seat people, export the seating PDF, check the invitation looks; fix what's found.
- [ ] 3. Declutter the busiest screens (Guests, Seating toolbar, Setup → Invitation, Texts): keep the
      everyday actions visible, roll the rest into More / Advanced. Keep labels the tests use, or update tests.
- [ ] 4. More tap-through tests: a guest opens their invitation and RSVPs (yes with a diet); budget line added;
      checklist item ticked; texts screen shows the 8c price and the per-guest figure.
- [ ] 5. Seating sample PDF (/demo/seating-pdf): seat the sample couple with ids couple-1 / couple-2 so their
      rose colour shows; check every page by eye in the browser pane.
- [ ] 6. Front page speed on phones: the hero phone frame loads after the page is shown (keep the iframe
      title the tests look for); check Lighthouse-style weight by reading the built asset sizes in CI logs.
- [ ] 7. Visual pass on each invitation look (/designs, every look) at phone size in the browser pane; fix
      overlaps or clipped ornaments in guest/looks.css.

## Waiting on the owner (don't start)
- Guest languages: which ones first.
- Terms placeholders: business name, ABN, state or territory.
- Cloudflare: Block AI bots switch; Workers AI permission on the API token; R2 enabled.

## Log
- 2026-11-09: worklist created.
