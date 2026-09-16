# Product review — September 2026

A fourth pass, and a different question again. The security audit asked what an attacker
could do; the UX audit asked what happens when the connection fails. This one asks the
plainest question of all: **is each screen good at the job the person in front of it is
trying to do?**

Written after walking every screen in a running production build at desktop width and at
390px, not from the code. Screenshots informed every note below.

Nothing here is a defect. It is all judgement, and it is all arguable — which is why each
item says who it is for and what it buys, so you can disagree with a reason.

---

## The five that would change the product most

Ranked by how much they change a working day, not by effort.
**All five are done — 2026-09-16.** Each entry below says what shipped.

| #   | Change                                                       | Who feels it     |
| --- | ------------------------------------------------------------ | ---------------- |
| 1   | Dates display as `09/16/2026` — American order, product-wide | everyone         |
| 2   | Payroll has no record that anything was ever **paid**        | the office       |
| 3   | The dashboard shows numbers, not the work left to do         | the branch admin |
| 4   | The teacher's home screen truncates the one fact they need   | teachers         |
| 5   | Phone and money fields do not open a number pad              | the front desk   |

---

### 1. Every date input reads in American order

`<input type="date">` renders in the browser's locale, so the payroll range shows
`09/01/2026` → `09/16/2026` while every date the product renders itself shows
`16/09/2026`. Two orders on one screen, and the ambiguous ones — `09/01` — are the common
case in the first twelve days of a month.

This is the single highest-value fix in the document because it is everywhere: payroll,
every report, the attendance board's day picker, joining dates, rate effective-from.

**Done.** `shared/ui/date-field.tsx` replaced all fourteen native date inputs. It is a
text field showing `dd/MM/yyyy` with a calendar beside it, because the format cannot be
imposed on the native control — it follows the browser, not the page, so on one machine
it reads one way and on the next it reads the other.

Typing is the fast path and the office types, so the text box comes first;
`inputMode="numeric"` for the phone. `calendar.tsx` and `popover.tsx` were already in the
repo and imported by nothing, exactly like `form.tsx` was.

What leaves the component is always ISO — the display is the only thing that changed, and
a form that read the visible text would submit the wrong thing entirely. `date-text.ts`
holds the parsing with seven tests, including the one that matters:
`09/01/2026` reads as **9 January**.

### 2. Payroll says what is owed, never what was paid

The sheet computes the month correctly and prints beautifully. Then the money is handed
over and the system learns nothing. Next month nobody can answer "did we settle
September?" from the product — only from the paper it printed.

**Suggestion.** A `payroll_runs` table: a locked period, per teacher, with the amount, the
date, and who recorded it. Two consequences worth more than the record itself — a period
that is settled can be frozen against later attendance edits, and the teacher's own
"مستحقاتي" screen can show "شهر ٨: مدفوع" instead of leaving them to ask.

This is the biggest functional gap in the product that is not already written down as an
open question.

### 3. The dashboard reports; it does not direct

It shows مجدولة 8 · مسجّلة 7 · متبقية 1 · حضور اليوم 100%. Two problems.

**"100%" is not the day's attendance.** It is the attendance of the sessions that have
been marked. At 10am with one register still open, "100%" is true and misleading at once.
Say `7 من 8 حصص · 100% مما سُجّل`.

**The one actionable number is not actionable.** "متبقية 1" is the whole job of the
morning, and it is a number in a box. Under it should be the list: which period, which
class, which teacher, and a link straight into the register.

**Done.** The work comes first now: `openRegistersToday` returns the rows rather than
counting them, so the card lists which period, which class and which teacher, each one a
link straight into the register. The four numbers moved below it.

A cancelled session is deliberately NOT open. It was dealt with, and putting it back on
the morning's list is how a list becomes something people stop reading.

And the percentage relabels itself: with marks in, it reads **حضور المُسجّل حتى الآن**
rather than "today's attendance".

### 4. The teacher's home screen cuts off the end time

Two cards, and the line under each reads
`...9:30 · فرع مدينة نصر · بنين - 1 علمي` — truncated. What falls off the end is when the
lesson finishes. This is the screen a teacher opens six times a day.

Below the two cards is an empty two-thirds of a phone screen.

**Done**, three of the five:

- The time is on its own line and never truncates.
- The lesson running now — or the next to start — is ringed and badged **الآن**. Only on
  today: highlighting a period because the clock is past it would be noise on any other
  day.
- An unmarked lesson is amber, and one line at the top says how many are still open, so
  "am I done?" is answered without counting badges.

Not done: the class size on the card, and this month's earnings in the empty space. Both
need data the query does not fetch, and both are additions rather than corrections.

### 5. No number pad on the fields that are all numbers

`inputMode="numeric"` appears four times: the login form and the public lookup. It is
absent from the four phone fields on the student form, the teacher's phone, the branch
phone, and both rate fields.

The student form is filled in dozens of times a day, often on a tablet at the desk, and
every phone number costs a keyboard switch. Four per student.

**Done.** Nine fields: four phones on the student form plus the national id, the
teacher's phone and both rates, and the branch phone. The shared `Field` wrappers carry
the prop now, so the next digit field gets it by saying so.

---

## Screen by screen

### `/` Dashboard — see above

One more: the two buttons top-left (المستحقات · التقارير) repeat the sidebar. The space
would be better spent on the date, which is currently small grey text.

### `/students` — the workhorse

**Works:** the search, the formatted phone, the note that a student code never changes.

- **The الفرع column is the same value on every row.** A branch admin has one branch; the
  column exists for the transferred-out case. Show it only when the row's branch differs
  from the viewer's, and give the width back to the name.
- **No total.** "180 طالب" belongs next to the title; it is the first thing anyone asks.
- **The whole row should open the profile,** not only the name.
- **A "بيانات ناقصة" filter** — no parent phone, no national id. Missing data is invisible
  until the day you need to call somebody, and then it is too late to fix.

### `/students/new` — see finding 5

One more, worth more than it sounds: **"واتساب ولي الأمر = نفس الرقم"** as a checkbox.
For most parents it is the same number, and it is currently eleven digits typed twice.

### `/attendance` — the board

**Works:** the marked/total chip per period, lazy sessions, the extra-session button.

- **An unmarked period should look unfinished.** "لم تُسجّل" is styled like everything
  else; it is the only row that needs the eye.
- **Nothing shows which period is happening now.** A line or a marker on the current one
  would orient the user before they read anything.
- **The day arrows are an RTL trap.** Confirm with a real user which of `‹ ›` they read as
  "yesterday" — this is the kind of thing that is obvious to whoever built it and a
  coin-flip for everyone else.

### `/attendance/mark` — the register, on a phone

**Works:** everyone present by default, one tap for absent, 44px targets, the fixed save
bar. This is a well-designed screen.

- ~~**The counters vanish on a phone.**~~ **Done:** they are in the bar at every width,
  stacked above the button on a narrow screen.
- ~~**Say what the save will do.**~~ **Done:** the button reads `حفظ الحضور — 3 غياب`.
- **Tapping to cycle is not discoverable.** A first-run hint, once, is enough.
- **A class of forty needs a way to jump.** Fifteen is fine today; a search or an
  alphabet rail is what stops this screen aging badly.

### `/timetable` — the best screen in the product

The grid is genuinely good: times computed from the bell schedule, teacher under subject,
empty cells that invite a click.

- **Colour by subject.** A week of identically-styled cells hides the pattern. Colour
  makes "the same teacher twice on Sunday" visible without reading.
- **A teacher's week, from here.** The question "when is سارة free?" is asked while
  looking at this grid and currently requires leaving it.
- **Sticky header row** once a branch uses eight periods.

### `/payroll` — see finding 2

- **Default to the last complete month.** It opens on month-to-date, which is the one
  range you never pay on. Add الشهر الماضي · هذا الشهر presets.
- **The الفرع column** is the same value on every row, as on students.
- **A per-teacher sheet to hand over** — currently the print is the whole branch.

### `/reports/matrix` — the class register

Dense, colour-coded and readable. Two things stop it being actionable:

- **No total per student.** The eye has to count pink cells. A غياب column at the end
  turns a picture into a decision.
- **The name column must stick** when scrolling a month sideways.
- **A cell should be clickable** — seeing that Tuesday was wrong and being unable to go
  and fix it from here is the frustration this screen creates.

### `/lookup` — the parent's screen

**Works:** one job, one screen, the privacy line at the bottom, numeric input. This is the
screen most likely to be used by someone who has never seen the product, and it is right.

- **A "no result" that helps.** When the code and the four digits do not match, the reply
  should offer the centre's phone number rather than only refusing.
- **A date range.** A parent asking about last month currently cannot.

---

## Three larger ideas

Not screens — directions. Each is a phase of real work.

**A "today" screen for the branch office.** The product has all the parts: unmarked
registers, absences to call, a teacher who has not marked anything, a class with no
timetable. Nobody looks at four screens every morning; they look at one and then act. The
dashboard is the place for it (finding 3), and a full version of it is the single biggest
change available to the branch admin's day.

**Message templates instead of raw `wa.me` links.** The absence alerts open WhatsApp with
nothing in it, so every message is typed by hand and every one is worded differently.
Templates — one for a first absence, one for a pattern — would make the messages
consistent and the follow-up actually happen. It also answers §16 question 8 in the
cheapest possible way, without any integration.

**A register that survives a bad connection.** Phase A of the UX audit stopped a dropped
save from destroying the screen. The next step is for the marks to survive a reload:
write them to local storage as they are tapped, restore on open, clear on a confirmed
save. For a teacher on a branch's connection, that is the difference between trusting the
app and keeping a paper list as well.

---

## What I would do first

1. **Dates** (finding 1) — an afternoon, and it removes a class of misreadings.
2. **Number pads** (finding 5) — an hour.
3. **The teacher's home screen** (finding 4) — half a day, on the screen opened most.
4. **Counters in the register's save bar** — an hour, on the product's most important
   interaction.
5. **The dashboard as a worklist** (finding 3) — a day, and it changes what the morning
   looks like.

Then decide about payroll runs (finding 2), which is a feature rather than a refinement
and deserves its own conversation.
