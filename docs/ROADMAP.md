# What is left — and what I would do next

Written 2026-09-17, after payroll runs closed the last item the product review had
raised. It answers four questions: what is missing, whether to keep building or stop,
what the phases are, and in what order.

## The short answer

**Stop building. Deploy it.**

Not because the feature list is finished — it never is — but because of three facts that
are all true at once:

1. **Nothing in this product has ever run outside one laptop.** Every phase report ends
   with "on this machine". "Deploy on a real server" has been item 1 of Next steps since
   Phase 10 and has not moved while eight more phases were built on top of it.
2. **It now holds money.** Before P5, losing the database meant re-entering attendance.
   Now it means the centre does not know who has paid and which teachers have been
   settled. The cost of an operational failure has changed; the operational readiness
   has not.
3. **Everything on the "missing" list below is a GUESS.** One real month at one branch
   will produce a better list than I can, and it will contradict some of mine.

The gap is no longer between what the product does and what a centre needs. It is
between the product and reality.

## "Should we harden and close the gaps instead?"

The gaps in the CODE are closed. Three reviews — `SECURITY-REVIEW.md` (8 findings),
`AUDIT-2026-09.md` (14), `PORTAL-REVIEW-2026-09.md` (7) — plus a UX audit and a product
review. Every finding is fixed and has a test. RLS is on every tenant table, `ENABLE`
and `FORCE`; both ledgers are append-only by GRANT; 571 unit and integration tests and
352 end-to-end.

More hardening of the code would be **polishing something nobody has run**. The
hardening that is actually missing is operational, and it is phase 1 below.

---

# The phases

## Phase 0 — freeze and label — **half a day**

- Stop adding features. Tag the commit that goes to the server.
- `pnpm db:seed` one last time (every e2e run leaves rows behind — see Next steps 4).
- Write down, in one page, what the centre is getting. Not the architecture; the
  screens.

## Phase 1 — the real server — **2 to 3 days, and this is the one that matters**

Answer **§16 question 10** first: hosting. My recommendation is a small VPS (2 vCPU,
4 GB, Egypt or EU) running the Docker Compose that is already written. Managed cloud is
several times the price for one centre and buys nothing this product uses.

Then, in order:

1. Deploy, and set the real values for `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `LOOKUP_IP_SALT`, `PORTAL_PHONE_SALT` and `BACKUP_PASSPHRASE`. Without the last one
   the dumps are plaintext and the log says so daily.
2. **Do the restore drill ON that server, before it holds one real row.** The procedure
   is in `RUNBOOK.md`. A backup nobody has restored is not a backup, and the only moment
   this is cheap to find out is now.
3. **Copy backups off the box.** The container writes to a local volume — that is a copy
   of the machine that would be lost with the machine.
4. **Two alerts, and no more:** is the site up, and did last night's backup run. A free
   uptime pinger and a cron that shouts is enough. Today, if the app is down at 7am,
   nobody learns it until a teacher rings somebody.

**Do not skip 2 and 3 because the centre is in a hurry.** They are the only two items on
this page that are irreversible if they are wrong.

## Phase 2 — one branch, one month, real data — **a month, mostly not yours**

Nasr City only. Real students, real timetable, real registers, real fees.

The portal stays shut for everybody (P7's per-branch switch already does this). No
messages. One branch, doing its ordinary month, on the real system.

What to watch, and write down:

- Does the office actually mark registers **every day**, or does it catch up on Thursday?
- Does the computed payroll match what the centre actually hands over?
- Does the collection screen match the money in the drawer?
- What did somebody ask for that does not exist?

## Phase 3 — fix what the month found — **a week, budgeted in advance**

Reserve it now. Do not spend it in advance on my list below.

## Phase 4 — open the portal, one branch — **`RUNBOOK.md` already has the procedure**

Staff first with their own children, then the branch, then print the cards. Watch the
audit log for whether anybody signs in; a flat line means the cards are in a drawer.

---

# What I know is missing, in the order I would do it

**Items 1, 2, 3 and 4 were built on 2026-09-17, and item 5's one unblocked step with them**, ahead of the deployment phases, at the
owner's instruction. The recommendation above stands unchanged: they are three more
pieces of code that have never met a real user, on a deployment that has not happened.

The rest are for **after** phase 3, and phase 3's findings outrank all of them.

### 1. A register that survives a bad connection — **built**

A teacher marks thirty students on a branch's wifi and the save fails. The UX audit
stopped that destroying the screen; a **reload** still loses everything. Write the marks
to local storage as they are tapped, restore on open, clear on a confirmed save.

This is the product's most-used interaction, on the worst connection it will ever meet.

**Built.** The draft is OFFERED on reload, not applied — a register that silently
disagrees with the server is worse than one that lost a tap, and nobody chose it. It is
read with `useSyncExternalStore` rather than an effect, so the server renders no banner
and there is no hydration mismatch and no cascading render.

The bug worth recording: the first version cleared the draft in the same effect that
wrote it, `if (dirty) write else clear`. A fresh load starts CLEAN — so the effect ran on
mount and wiped the draft it existed to protect, before the banner could offer it. The
draft is now cleared only where it is actually finished with: a confirmed save, or تجاهل.

### 2. The owner's money screen, across branches — **built**

`/fees` and `/payroll/runs` both refuse "كافة الفروع", correctly — a till belongs to one
desk. But the consequence is that **the owner's own question has no screen**: how much
did the centre collect this month, and what does it owe its teachers. Today they would
switch branch three times and add it up on paper.

**Built** at `/reports/money`: read-only, cross-branch, the same shape as the existing
branch comparison. Billed, collected, outstanding, payroll owed, payroll paid, and the
figure the owner asks for first — collected minus paid out, per branch and in total.

Outstanding is summed per invoice rather than from the totals, the same rule
`domain/ledger.ts` states for one branch: a family that paid in advance must not quietly
cover another family's arrears. And the screen has nothing to press, which a test
asserts — money is taken and paid out at one desk, in one branch.

### 3. An accounting export — **built**

Payroll and students export to CSV; payments did not. Whoever does the centre's books
will ask in the first month.

**Built** on `/fees`: every receipt of the month it was RECEIVED in — that is the month
the books close — with reversals as negative lines carrying their own numbers rather than
as omissions. A book that quietly skips a cancelled receipt does not reconcile.

### 4. Academic terms — **built**

Reports, fees and the portal all work on date ranges, which was the plan's own default.
If the centre genuinely thinks in terms — "الفصل الأول" rather than "من ١ سبتمبر" — this
is worth doing, and it is the only open question that changes the database.

**Built**, and deliberately the smallest thing that makes the word true. A term is a
NAMED DATE RANGE and nothing else: reports keep working on `from` and `to`, and a term
fills them in. Nothing that already computes anything was rewritten, a shared report URL
still carries plain dates, and a centre that never adds a term sees no picker and no
change.

The reason it was worth doing at all is that the product already SAID "الفصل" in one
place and did not mean it: the public lookup has shown a parent a term percentage since
Phase 9 that was really the last twelve months, with `TERM_MONTHS = 12` carrying a
comment naming this very question. It now means the centre's own term — and still falls
back to twelve months where there is no calendar, so nothing changed for anybody who has
not filled one in.

Two things kept it small and are worth stating: it is **centre-wide**, because the
calendar comes from the ministry and three copies of it would be three things to keep in
step; and **fees stay monthly** — P5 answered that and built it, and a term fee is a
different feature rather than a consequence of naming the calendar.

### 5. Automatic messages — **still blocked; the opt-out built early**

`MESSAGING-AND-FEES-PLAN.md` has the whole plan. It waits on a provider, a budget, and
the question that sinks projects like this: **who reads the replies?** P4a and P4b
already deliver most of the value with a human in the loop, which at this size is a
feature.

**One step of it was built (2026-09-17): the opt-out**, `drizzle/0018`. It needs no
provider and it was already overdue — the office has been messaging parents by hand
since P4a, and a parent who said "stop" had nowhere to be recorded but somebody's
memory. Both screens that message anybody now honour it, and the parent can set it
themselves in the portal.

**The rest was deliberately not built**, and not only because of the decision: steps 1,
3, 5 and 6 are a queue, a job, a screen and a cap for a sender that does not exist. A
WhatsApp outbox carries approved template ids and typed parameters; an SMS one carries a
string. Designing the queue before the provider is chosen is designing it for the wrong
one.

### Also open, and smaller

- **§16 question 4** (travel time between branches for a shared teacher) — the default,
  no gap, has not hurt anybody yet.
- **`/lookup` performance** — 150 KiB of framework JavaScript for one form. Only matters
  if somebody is counting the Lighthouse score.

---

# What I would NOT do

**Build anything else before phase 1.** Every feature added now is more code that has
never met a real user, sitting on top of a deployment that has never happened. The
product does not need more; it needs to be true.
