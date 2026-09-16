# P4 and P5 — messages, and money

Written 2026-09-16, after P1–P3, P6 and P7 shipped and left these two standing.

`docs/PARENT-PORTAL-PLAN.md` describes both in a paragraph each and calls them blocked.
They are, but not equally, and not for the same kind of reason — which is the first thing
worth saying:

- **P4 is blocked on a decision and a bill.** Most of its value was not — **P4a and P4b
  are built (2026-09-16)**, and only automatic sending still waits.
- **P5 is not really a portal phase at all.** It is the product's money phase, and it is
  **built (2026-09-16)**. The portal got the last two days of it, as planned.

Both sections below say what to build, in what order, what it costs, and — first — what
the owner has to decide, because a plan that hides its questions is a plan that discovers
them halfway through.

---

# P4 — being told, not asking

**Goal:** the parent hears about an absence on the day, not at the end of the month.

## What exists today

The absence alerts report lists students over the threshold with a `wa.me` link beside
each. The link opens WhatsApp **with nothing in it**. So every message is typed by hand,
every one is worded differently, and there is no record that anybody was contacted.

That is the whole of the centre's parent messaging.

## The decision: §16 question 8

Its default is "manual `wa.me` links". Three real options.

### A. Templates on the links that already exist — no provider, no bill

The office still clicks, but WhatsApp opens **pre-filled** with a correct Arabic
sentence. No integration, no per-message cost, no consent regime, no delivery failures,
nothing to approve.

**Cost:** about a day. **Answers §16 q8 in the cheapest possible way**, as the product
review already argued.

### B. WhatsApp Business Cloud API — real automation

What it actually requires, and each of these is a gate rather than a task: business
verification, a dedicated number that stops being usable in the normal WhatsApp app,
**every template approved by Meta** (in Arabic, and they can refuse the wording), and
per-conversation pricing in the utility category. Then, on our side: a queue, retries,
delivery receipts, opt-out, and a screen that says why something did not send.

**Cost:** two to three weeks, plus a monthly bill, plus an approval process outside
anyone's control.

### C. SMS through an Egyptian aggregator

Cheaper to integrate than B — a sender ID registered with the NTRA, an HTTP call per
message. Worse in every other way: no rich text, weaker delivery visibility, and in Egypt
**WhatsApp is what parents actually read**. SMS is what parents ignore alongside the bank
and the mobile operator.

## The recommendation: A now, B only when somebody will own it

Not on cost. On this: the real risk in automatic daily messages to five hundred families
is **not technical**. It is the wave of replies to a number nobody is watching, the
opt-outs, and the parent who writes back "my son was there" — because attendance was
marked wrong and the system has just told the family so, in writing, automatically.

At this centre's size, **a human looking at each message before it goes is a feature, not
a limitation.** Automate it when the volume makes that impossible, and not before.

So P4 splits into a part that is not blocked at all, and a part that is.

## P4a — templates — **built**

- `message_templates` in centre settings: first absence, repeated absence, low
  attendance. Arabic, with placeholders — `{الطالب}` `{اليوم}` `{الحصص}` `{النسبة}`
  `{الفرع}`.
- Rendered **server-side** into the `wa.me?text=` link. The parent's full number must
  stay off the page exactly as it does today (`maskPhone` on screen, the number only
  inside the href).
- **Log the contact.** One audit row per message opened — who, which student, when. This
  is the part that makes follow-up happen: the office can see this child was rung
  yesterday and not ring twice, and the owner can see whether anybody is doing it at all.
- The wording lives in settings, not in the code, so the centre can change it without a
  deploy.

**Done when:** the alerts screen opens WhatsApp with a correct sentence about the right
child, the log shows who was contacted today, and changing the wording needs no developer.

**Built**, in `drizzle/0012` and `src/shared/lib/message-template.ts`. Three templates
live in centre settings with a **live preview** beside each, which is the feature: an
unknown placeholder is left in the text rather than dropped, so `{النسبه}` shows up in
the preview instead of arriving at five hundred families as a gap. `contact` is a new
audit action — not an 'update', because the log is a thing you filter — and both screens
now say آخر تواصل or لم يتم التواصل من قبل against every row.

## P4b — one message a day, per family — **built**

The rule the plan already states — _one message a day, after the last period, naming the
periods missed_ — does not need a provider. It needs a screen.

- "Today's absences, grouped by parent": one row per **family**, not per absence. A child
  absent in three periods is one row naming three periods. Siblings are one row.
- One click per family.
- The branch's own last period comes from `branch_schedule_settings`, which already knows
  it — so the screen is correct for a branch whose day ends earlier.

**Done when:** a child absent in three periods produces one row and one message, and two
siblings absent the same day produce one.

**Built** at `/attendance/contact` — under attendance rather than reports, because this
is not something read at the end of the month, it is the last thing the office does
before going home. Both rules are unit-tested in `domain/contact-list.ts`, and siblings
get ONE message naming both children rather than two copies of the same paragraph.

Two things were added that the plan had not asked for and the screen is worse without:
a **warning when registers are still unmarked** (a day that is not finished is a day
whose absences are not final — sending then is the six-messages mistake wearing a
different hat), and a **date control**, because half the time the office rings the next
morning about the day before.

## P4c — automatic sending — **blocked on §16 q8, 2–3 weeks**

Only after the provider decision. Built in this order, because each step is what makes
the next one safe:

1. **`message_outbox`** — recipient hash, template, rendered body, state
   (queued / sent / failed / skipped), provider id, attempts, error. A queue, because a
   provider _will_ fail and a **silent** failure is worse than no feature at all.
2. **`parent_contact_prefs`** — opt-out per phone, honoured before anything is queued,
   and switchable **from the portal**. That is the portal's actual role in P4: the
   opt-out belongs where the parent already is, not in a reply nobody reads.
3. **The job**, per branch, after that branch's last period.
4. **A provider adapter behind one interface**, so WhatsApp-versus-SMS is one file and
   not a decision baked through the codebase.
5. **An office screen**: what went out, what failed, and a resend that cannot
   double-send.
6. **A daily cap per branch.** A bug that sends five hundred messages twice is a bill, and
   a cap is cheaper than trusting the loop.

**Done when:** a day with three absences for one child produces one message; an opted-out
parent produces none; and a failed send is visible to the office within the hour rather
than never.

## What the owner must decide before P4c

1. Provider: WhatsApp Cloud API, or an SMS aggregator?
2. Who owns the sending number, and does it stop being a normal WhatsApp?
3. What is the monthly budget, and what happens when it runs out mid-month?
4. **Who reads the replies?** This is the question that sinks projects like this one.

---

# P5 — money

**Goal:** "what do I owe" — and the honest answer is that the product cannot say it about
anybody yet.

## The headline: there is no ledger

The system knows what a teacher has **earned** — rates snapshotted onto each session,
computed into a payroll sheet. It does not know what anyone has been **paid**: payroll is
a report, not a record. The product review called it "the biggest functional gap in the
product that is not already written down as an open question".

And about students it knows nothing at all. No fee, no invoice, no payment, no receipt.
Twenty-three tables and not one of them holds money coming in.

So P5 is not "add a screen to the portal". It is **the product's money phase**, and it has
a consequence worth planning around: _the ledger built for students is the same ledger
that finally lets payroll say "paid"_. Build it once, for both.

## P5a — the decisions — **answered by the defaults below, and recorded**

Six questions. The defaults below are what was BUILT: the instruction was to proceed, and
each default is an argument rather than a guess. Every one of them is cheap to change
except the first, which is in the shape of `invoices`.

1. **What is a fee attached to?** Class, subject, or student?
   → _Default: monthly per class (شعبة)_, because that is how Egyptian centres price.
2. **What period?** Monthly, per term, per session?
   → _Default: monthly._ Terms do not exist in this product (§16 q7 is still open).
3. **Does absence reduce the fee?**
   → _Default: no._ This is the one that causes arguments at the desk, and the default
   should be the one the centre can defend in a sentence.
4. **Discounts** — siblings, hardship, staff children. A percentage or an amount? Who may
   grant one, and does it need a reason?
   → _Default: an amount, granted by a branch admin, reason required._
5. **Who may record a payment?** Branch admin only, or a new cashier role?
   → _Default: branch admin._ A new role is a new permission matrix and a new test suite.
6. **Receipts.** Is a printed, numbered receipt expected — and does the numbering have to
   be per branch, per year, unbroken?
   → _Default: yes, per branch per year, from a counter table._

## P5b — the ledger — **built**

- **`fee_plans`** (branch, class, amount_piasters, period, effective_from) — versioned the
  way `teacher_rate_history` is, because a price rise must not rewrite last month.
- **`invoices`** (student, period, amount, discount, reason, status) — generated per month
  per enrolled student, **idempotently**: running the generator twice must not double-bill
  anybody, and somebody will run it twice.
- **`payments`** (invoice, amount_piasters, method, received_by, receipt_no, received_at)
  — **append-only. Never edited, never deleted.** A mistake is a reversal row. That is
  what a ledger is; anything else is how money quietly disappears and nobody can say when.
- `receipt_counters`, per branch per year, the same pattern as `student_code_counters`.

**Two things the build added that this plan had not thought of.** "Paid" is not a column
at all — it is `sum(payments) >= amount - discount`, computed in `domain/ledger.ts`,
because a stored status is a second source of truth that drifts from the first. And there
is no "cancelled" state: an invoice raised in error is **discounted in full with a
reason**, which is the same outcome, auditable in the same place, and one fewer state for
the rest of the product to reason about.

**And one hole the isolation test found that reading would not have.** A branch admin
could insert a payment carrying THEIR branch id against ANOTHER branch's invoice. RLS
checked the row's own branch (correct) and the foreign key checked the invoice exists
(also correct) — neither asked whether the two agreed, and **foreign keys are not subject
to RLS**, so the invoice the attacker could not see was still a valid target. Closed with
a composite foreign key in `drizzle/0015`.

All of it under the rules this product already holds: integer **piasters**, `branch_id` on
every row, RLS enabled and forced, every write through `createAction` and audited, and an
isolation test per table.

## P5c — the office screens — **built**

- **Per class, this month: who has paid and who has not.** This one screen is what the
  office actually wants, and it is worth more to the centre than the whole portal. It
  shows the count of students nobody has billed at the top, because that is the question
  before all the others.
- Per student: the statement — charged, discounted, paid, outstanding.
- A printed A5 receipt, reusing `PrintSheet`.
- A collections report with an export, and the first number on the dashboard the **owner**
  personally cares about.

## P5d — the parent's side — **built, and it is the smallest part**

Outstanding balance, what it is for, what has been paid, and the receipt — in the portal,
behind the session that already exists.

**Not online payment.** A different product, a different risk (a payment provider, card
data, refunds, disputes, chargebacks), and a different conversation. Say so plainly when
it is asked for, which it will be.

## The part that pays for itself — still to do

Once `payments` exists, teacher payroll gets the same treatment almost free: a settled
period, per teacher, with the amount, the date and who recorded it. Two consequences the
review already wanted — a settled month can be **frozen against later attendance edits**,
and the teacher's مستحقاتي screen can say "شهر ٨: مدفوع" instead of leaving them to ask.

**Not built.** The ledger it needs now exists and the pattern is set, but paying teachers
is a different conversation from collecting from students and deserves its own. This is
the obvious next piece of work in the product.

---

# What I would do

**Done (2026-09-16):** P4a and P4b. No provider, no bill, no new decision beyond the
wording — and they deliver most of what P4 was for. The office gets consistent messages,
one per family per day, and a record of who was contacted.

**Now stopped on P4.** P4c is two to three weeks of work whose hardest problem is not code.
Build it when somebody has answered question 4 above.

**P5 is built**, office side first and the portal last, for the reason given above: a
parent who can see a balance the office cannot explain is worse than a parent who rings
and asks. What remains is payroll runs — the teacher half of the same ledger.
