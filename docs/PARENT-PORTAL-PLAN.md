# Parent & student portal — a plan

Written September 2026, after the security, UX and product reviews.

**P1, P2, P3, P6 and P7 are built (2026-09-16).** What shipped differs from what this
planned in two places, and section 3 says where. **P4 and P5 remain a plan**, both
blocked on decisions rather than on work: P4 needs a messaging provider (§16 q8) and P5
needs student fees to exist in the admin product at all.

---

## 0. Start from what already exists

`/lookup` is not a placeholder. Today, with no account and no session, it already
returns:

- the student's name, masked to first name + family initial;
- their branch and class;
- their **whole weekly timetable**;
- attendance for the month and for the term, as counts and a percentage;
- **every absence and late, with the date, the subject, and the teacher's note.**

That is most of what a parent portal shows. So the honest question is not "how do we
build a portal" but:

> **What does a parent get from an account that they do not get from the lookup?**

There are only four real answers, and they are the whole plan:

| What an account adds                     | Exists today? |
| ---------------------------------------- | ------------- |
| Not re-typing a code every time          | no            |
| All of my children on one screen         | no            |
| Being **told**, instead of going to look | no            |
| Things the product does not have yet     | —             |

The fourth is the important one. A parent's two most common questions after "was my
child there" are **"what do I owe"** and **"how is he doing"**, and this product has
neither fees nor grades. A portal that cannot answer them is a nicer lookup, and should
be scoped as one.

---

## 1. Four decisions, before anything is built

### Q1 — Portal, or a better lookup?

If the answer to "what does an account add" is only the first two rows of that table,
this is **two weeks**, not two months: phases 1–3 below and nothing else. If it is meant
to carry fees and messages, it is a product of its own and the fee decision has to come
first.

**My recommendation:** build phases 1–3 and stop. Add phase 4 when there is something
worth telling parents; add phase 5 only after fees exist in the admin product.

### Q2 — How does a parent prove who they are?

Three options, and this is the one that decides everything else.

**A. Stay anonymous (today).** Code + last four digits, every visit. Cheapest, no
accounts to support, no passwords to reset. Already built and already hardened.

**B. A one-time code by WhatsApp or SMS.** The parent types their phone; a six-digit
code arrives; a signed cookie lasts thirty days. **No passwords anywhere.** Costs money
per message and needs a provider — and §16 question 8 (automatic messaging) is still
unanswered, so this decision and that one are the same decision.

**C. Usernames and passwords for parents.** Do not. Five hundred parents with passwords
means the branch office becomes a helpdesk, and the first thing they will all ask is to
have it reset over the phone — which is a worse authentication path than the one you
replaced.

**My recommendation: B, and treat it as gated on the messaging decision.** Until that is
made, A is not a stopgap; it is a defensible product.

### Q3 — Is the user the parent or the student?

They want different things. A parent wants attendance, money and the centre's phone
number. A student wants their timetable and what they missed.

The credential settles it: the portal is keyed on the **parent's phone**, so it is the
parent's portal, and a student who wants their timetable can keep using the lookup.
Deciding otherwise means a second credential per student and doubles phase 1.

### Q4 — Who answers the phone when it does not work?

Not a technical question, and it kills more portals than any technical one. Five hundred
families is five hundred people who can be locked out on a Saturday morning. Option B
above exists mainly to make this answer "nobody has to" — there is nothing to reset.

---

## 2. Where it must NOT go: a fourth role

The tempting design is a `parent` role in `user_role`, with RLS policies scoped to a
student. **Do not.**

Every tenant policy in this product is written as a positive allowance keyed on
`app_role()` and `app_branch_id()`. A parent's scope is neither: it is one student, which
is a new dimension that would need a new setting, new policies on five tables, and a
re-audit of all of them. That is the largest possible change to the part of the system
that the whole security review rests on.

**The pattern to extend is the one already here.** `app_public_lookup` is a
`SECURITY DEFINER` function that takes a credential and returns exactly one payload. It
never grants the caller a tenant context; the function itself is the boundary, and it is
auditable in one file.

A portal should be more of those: `app_portal_children(phone_hash)`,
`app_portal_attendance(student_id, from, to)`. Narrow, audited, and reviewable the same
way — and the answer to "can a parent see another child" stays "read this one function",
not "read forty policies".

---

## 3. The phases

Each has acceptance criteria in the style of PROJECT_PLAN section 14, so they can be
worked the way the ten phases before them were.

### Phase P1 — identity without accounts — **built, on a different credential**

**Goal:** a parent proves the phone is theirs once, and stays in for thirty days.

**What shipped, and why it is not the OTP below.** An OTP needs a messaging provider that
does not exist and is not funded, and a portal nobody can sign into is not a portal. So
the credential is the one parents already have — the student code and the last four digits
of the phone, exactly what the anonymous lookup takes — and what the portal adds on top is
the **session**: typed once a month instead of once a visit.

That is a deliberate trade, and the cost of it is stated plainly: the credential is no
stronger than the lookup's, so the portal is no harder to reach than the lookup already
is. It is guarded by the same rate limiter, on the same two keys, sharing the same budget
— because two doors onto one secret with separate counters would hand an attacker twice
the guesses by alternating between them.

The OTP below remains the upgrade, and the table and the flow are unchanged by this: when
messaging is funded, `app_portal_verify` gains a sibling and nothing else moves.

- `portal_otp` table: phone hash, code hash, expiry, attempts, created_at. Never the
  plain code, never the plain phone.
- A code is six digits, valid for ten minutes, **five attempts** then dead — and a new
  code invalidates the old one.
- Rate limits keyed two ways, as the lookup already does: per phone and per IP. An
  attacker who knows a phone number must not be able to grind codes, and an attacker who
  knows none must not be able to enumerate which phones exist.
- **The reply is identical for a phone that exists and one that does not.** "If this
  number is registered, a code has been sent." Anything else is a way to test whether a
  family attends this centre.
- A signed, `httpOnly`, `sameSite=lax` session cookie on success. Not a Better Auth
  user: no row in `user`, no role, no tenant context.
- Every issue and every redemption in `audit_logs`, with the phone hashed.

**Done when:** an integration test proves a code cannot be reused, cannot be brute-forced
past five tries, and that a wrong phone and a right phone are indistinguishable from the
outside.

**Built:** `portal_sessions` (hashed token, hashed phone, nothing else), a 30-day
`httpOnly` cookie scoped to `/portal`, sign-out that ends the session on the SERVER, and
one reply for every failure — wrong code, wrong digits, a child who has left, and the
feature being switched off all say the same thing, and `parent-portal.spec.ts` compares
two of those strings to prove it.

### Phase P2 — the shell, and several children

**Goal:** one parent, all their children, on a phone.

- `/portal` with its own layout — no admin chrome, RTL, mobile first, 44px targets.
- `app_portal_children(phone_hash)` returns every **active** student whose
  `parent_phone` matches. Siblings come free: the model already allows two students to
  share a number.
- A child switcher when there is more than one, and no switcher at all when there is one.
- Names are **not** masked here. Masking exists because the lookup is anonymous; a parent
  who has proved the phone has earned their own child's name — and that is a decision to
  record, not to infer.

**Done when:** a parent with two children sees both, a parent with one sees no switcher,
and a student who has left the centre is not listed.

**Built**, including the decision about names: they are **not** masked in the portal. An
integration test creates two siblings and a stranger on the same branch and asserts the
stranger is absent from `app_portal_children`.

### Phase P3 — attendance, properly

**Goal:** everything the lookup shows, plus the things it cannot.

- The month, the term, and **an arbitrary range** — the lookup cannot do this and it is
  the first thing a parent asks in October about September.
- Each absence with date, subject, teacher's note.
- A printable record for the year — the A4 sheet already exists as a pattern in
  `/print/*`.
- The centre's phone and branch address on every screen, because the next action after
  reading a bad number is to ring somebody.

**Done when:** the portal answers every question the lookup answers, plus a custom range,
and the print sheet is one page for a term.

**Built:** any range up to two years (capped, because a public endpoint with an uncapped
range is an invitation), the absence list with the teacher's note, the branch's phone as a
`tel:` link, and an A4 sheet at `/portal/print` that re-runs the whole query rather than
trusting its own query string — signed out, that URL is a 404, and there is a test.

> **Stop here unless Q1 says otherwise.** P1–P3 is the whole portal for a centre that
> tracks attendance. What follows needs decisions that have not been made.

### Phase P4 — being told, not asking — **planned in detail: `docs/MESSAGING-AND-FEES-PLAN.md`**

**Goal:** the parent hears about an absence on the day, not at the end of the month.

- A message per absence is wrong — one child, six periods, six messages. **One message a
  day, after the last period**, naming the periods missed.
- An opt-out that works, and is honoured, and is tested. It belongs **in the portal**,
  which is this phase's actual use for P1.
- Templates, not free text (this is also the cheapest answer to §16 q8).

**P4a and P4b are built (2026-09-16).** Splitting the phase showed that templates and
one-message-per-family-per-day need **no provider at all**, and they carry most of the
value: `/attendance/contact`, three templates in settings, and a `contact` audit action
so the office can see who has already been rung. Only **P4c (automatic sending)** waits
on §16 q8, and its hardest question is not technical: who reads the replies.

**Done when:** a day with three absences produces one message, an opted-out parent
produces none, and a failed send is visible to the office rather than silent.

### Phase P5 — money — **planned in detail: `docs/MESSAGING-AND-FEES-PLAN.md`**

**Goal:** "what do I owe" — and it cannot be built until the admin product can answer it.

Blocked on the fee question raised in the earlier review: the system tracks what is owed
**to teachers** and nothing about what is collected **from students**. Until fees, an
invoice and a payment exist for the office, there is nothing for a parent to look at.

**Built (2026-09-16).** What planning it properly showed, and the build confirmed: this
is not a portal phase. The product has **no
money ledger at all** — payroll is a computed report, not a record that anyone was paid
— so P5 is the product's money phase, and the portal is the last two days of it. It
should be started by answering six questions rather than by writing a migration, and the
ledger it builds is the same one that finally lets payroll say مدفوع.

Scope for the parent's part when unblocked: outstanding balance, what it is for, what has
been paid, and a receipt. **Not** online payment — that is a different product, a
different risk, and a different conversation.

### Phase P6 — hardening the new front door — **built**

**Goal:** treat the portal as what it is: the first authenticated surface in this product
that is not staff.

The review is `docs/PORTAL-REVIEW-2026-09.md`: seven findings, all fixed, plus the two
things that were judged and deliberately left alone. Against the bullets below:

- ~~Its own rate limits, separate from the lookup's, on a separate key.~~ **Refused, and
  the review says why.** This bullet was written when P1 was still an OTP. It is not:
  sign-in and lookup are the same guess against the same secret, so two counters would
  hand an attacker twice the budget by alternating between two doors. One limiter, one
  budget. When the OTP arrives it is a different secret and this bullet comes back.
- Enumeration review: **done.** Every failure returns one string, and the suite compares
  two of them character for character rather than trusting the code path.
- Session review: **done**, and the answers are in the review — thirty days absolute, two
  revocation levers (change the phone for one family, `lookup_enabled` for the centre),
  and a session that names a phone rather than a list of students, so leaving,
  transferring and switching the portal off all take effect on the next page load.
- A security pass in the style of `docs/SECURITY-REVIEW.md`: **done**, and every finding
  says what an attacker gains.
- The CSP, the headers and the lockout already apply: **confirmed by measuring a
  production build**, not by reading the config. The one that mattered was
  `Cache-Control: no-store` — a portal page is about one child and must never sit in a
  shared proxy.

The two findings worth knowing without opening the review: sign-out never removed the
cookie from the browser (the delete used the wrong path, proved in a live browser before
it was fixed), and `portal_sessions` was readable by every staff query in the product
until `drizzle/0010` made it invisible to anything carrying a tenant role.

### Phase P7 — rollout — **built**

**Goal:** five hundred families arriving at once, deliberately.

The procedure is in `docs/RUNBOOK.md` under "Rolling the parent portal out". What had to
be BUILT for it is `drizzle/0011`, because the plan below was not executable with the
switches that existed — there was one, `lookup_enabled`, shared with the anonymous
lookup, so the only way to keep the portal shut for most families was to shut the lookup
every family already uses.

- The centre's own staff first: **procedure, step 1.** Nothing to build.
- One branch, one month: **`branches.portal_enabled`.** A rollout that cannot be done one
  branch at a time is not a rollout, it is a release with a nicer name.
- A printed card: **`/print/portal-card/[id]`**, four to an A4 sheet because the desk
  hands them out by the handful. The URL is large, monospaced and LTR, since a parent
  copies it off paper. The office's number is on it, in bold, under "لو لم تفتح معك".
  **The printer icon only appears for a branch already opened** — a card is a promise
  that the URL works, and printing one early is how a staged rollout becomes a morning of
  phone calls.
- A switch to turn the portal off without a deploy: **`center_settings.portal_enabled`**,
  its own switch rather than borrowing the lookup's. Both default to FALSE, because a
  feature that arrives switched on has not been rolled out, it has been released.

Three things fell out of building it that the plan had not asked for, and all three are
tested:

- The portal still requires `lookup_enabled`. It shows the UNMASKED name, so it must
  never be the door left open when the quieter one is shut.
- A deactivated branch closes the portal even if its switch was left on. Deactivating a
  branch is the strongest statement the centre makes about it, and a rollout switch that
  outlived it would be a trap set for a year from now.
- A family with children at two branches, one open and one not, sees the open one. That
  is the case that proves the switch belongs on the branch.

The seed is now a centre **in the middle** of a rollout — master switch on, Nasr City
open, the other two not — because that is the state the product spends its first month
in, and a demo that skips it hides the part most likely to be got wrong.

---

## 4. What I would do

**If the messaging decision is made and funded:** P1 → P2 → P3 → P4. That is a portal
worth the name, and the notification in P4 is the only part parents will actually notice
day to day.

**If it is not:** do not build P1 at all yet. Spend the same two weeks on the lookup —
a custom date range, the centre's phone on the page, and a printable record — and the
parent gets 80% of the portal with no account, no OTP cost, no helpdesk, and no new
authenticated surface to defend.

That is the recommendation I would argue for: **the cheapest version of this that is
still useful is not a portal.**

---

## 5. What this plan deliberately leaves out

- **Grades and exams.** Not in the product, and a portal is not where to add them.
- **Chat between parent and teacher.** A moderation problem wearing a feature's clothes.
- **A mobile app.** The portal is three screens; a phone browser is the right client.
- **Parent-initiated anything** — corrections, absence excuses, enrolment. Every one of
  them is a write path from outside the building, and each needs its own review. The
  portal as planned is **read-only**, and that is a feature.
