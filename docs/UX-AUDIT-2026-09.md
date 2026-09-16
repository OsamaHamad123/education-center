# UX and state management — September 2026

A third pass, after the security audit. Different question again: not "what can an
attacker do" but **what happens to the person at the desk when the system is slow, or
when a request does not arrive.**

Everything below was found by reading the code and driving the running production build,
including one experiment that aborts a save in flight. Counts are from the source.

## What holds up

- **Refresh discipline is consistent.** Every mutating component but one calls
  `router.refresh()` after a successful action, and the exception is the public lookup,
  which mutates nothing.
- **`useEffect` is used three times in 55 client components.** Almost nothing is
  synchronised by hand; state is derived. That is rarer than it sounds and it is why
  there are so few stale-state bugs in this product.
- **93 `disabled={isPending}`.** Double submission is genuinely prevented.
- **The attendance register keeps a `committed` snapshot** and rolls back to it when a
  save is refused, rather than re-reading from the server. It is the most careful piece
  of state in the codebase — and finding 1 is about the one case it does not cover.
- **Empty states exist** and say something useful rather than showing a blank table.

---

## Findings

| #   | Finding                                                            | Severity | Area      |
| --- | ------------------------------------------------------------------ | -------- | --------- |
| 1   | A dropped request replaces the screen and everything typed into it | High     | state     |
| 2   | There is no loading feedback anywhere in the product               | High     | UX        |
| 3   | Changing a filter gives no sign that anything is happening         | High     | UX        |
| 4   | The error page asks for a reference number it does not have        | Medium   | UX        |
| 5   | Unsaved work can be walked away from in silence                    | Medium   | state     |
| 6   | Validation is server-only; the form stack is installed and unused  | Medium   | state     |
| 7   | Every filter change adds history and jumps to the top of the page  | Medium   | UX        |
| 8   | Errors are reported three different ways                           | Low      | UX        |
| 9   | `revalidate` paths do nothing, and look like they do               | Low      | state     |
| 10  | Every list is rendered into the DOM twice                          | Low      | UX / perf |

---

### 1. A dropped request replaces the screen and everything typed into it — High

Twenty of the twenty-two mutating components call their server action like this:

```ts
startTransition(async () => {
  const result = await createClass(payload);
  if (!result.ok) { setError(result.error); return; }
  …
});
```

That handles a refused `Result` well. It does not handle the request **not arriving**.
A rejected promise inside a transition is re-thrown to the nearest error boundary, and
the nearest one is the app-wide `error.tsx`.

Verified by aborting the POST in flight on `/classes`. The whole page became:

> حدث خطأ غير متوقع
> تم تسجيل المشكلة. حاول مرة أخرى، وإن تكررت أبلغ الإدارة العامة بالرقم أدناه.

The dialog, the form and everything typed into it were gone.

The worst case is the attendance register. A teacher marks fifteen students on a phone,
on a branch's connection, taps حفظ, the request drops — and the register is replaced by
a full-screen error. The rollback logic that was written so carefully for a refused save
never runs, because this is not a refused save.

**Fixed** (phase A). `useAction` in `shared/ui/use-action.ts` is `useTransition` with the
missing case: it catches, the screen stays, and the failure arrives as a toast rather
than as a new page. Adoption is one line per component —

```ts
const [isPending, startTransition] = useAction();
```

— so not one action body changed, and every existing `setError` and `toast.error` path
still works exactly as it did. Twenty-two components, including `confirm-dialog`, which
covers every confirm-driven action at once.

The message does not say whether anything was saved. A request can reach the server,
commit, and lose its reply on the way back, so "لم يُحفظ" would be a guess; "try again" is
true either way.

### 2. There is no loading feedback anywhere — High

There is not one `loading.tsx` in the app. Every dashboard page fetches on the server, so
a navigation does nothing at all — no spinner, no skeleton, not even a URL change — until
the server has finished rendering.

There are four `<Suspense>` boundaries with skeleton fallbacks, on `/students`,
`/students/archive`, `/audit` and `/login`. None of them can render a fallback for DATA,
because the data is awaited above them:

```ts
const [page, classes] = await Promise.all([listStudentsPage(params), listClassOptions()]);
…
<Suspense fallback={<Skeleton className="h-24 w-full" />}>   // nothing inside suspends
```

**Correction, made while fixing this.** Those boundaries are not dead code, as first
written here. Every component inside them calls `useSearchParams`, which Next wants
wrapped, so they are load-bearing for a reason that has nothing to do with loading —
they simply cannot also serve as loading states. They were left alone.

On a fast local machine the silence is invisible; on a branch's connection it is the
whole experience of using the product.

**Fixed** (phase B), and not the way this said to. A route-group `loading.tsx` was
written first and **reverted**: it makes Next flush the shell before the page has decided
anything, so `notFound()` then arrives inside a response already sent as **200**. Eight of
this project's own tests caught it, and returning 200 for a student in another branch
would undo the thing `docs/SECURITY-REVIEW.md` leans on hardest.

What shipped instead is `useLinkStatus` — a spinner on the nav item that was tapped. The
feedback lands on the control the user touched, and the route still answers 404 when it
should. `tests/e2e/loading-feedback.spec.ts` asserts both, so the skeleton cannot come
back by accident.

One more thing came out of it: on a phone the menu used to close the instant a link was
tapped, so there was nowhere for the feedback to appear. The sheet now closes when the
route changes — keyed by the pathname, not synchronised from an effect.

### 3. Changing a filter gives no sign that anything is happening — High

Seven components navigate on every change of a date, a class, a status or a page:
`attendance-board`, `sessions-filters`, `audit-filters`, `report-filters`,
`students-filters`, `payroll-report`, `timetable-grid`. Five of them have no
`useTransition`, so nothing is disabled, nothing spins, and the old data stays on screen
looking current.

The attendance board's date stepper is the most used control in the product. Tapping
"يوم سابق" appears to do nothing, so it gets tapped again.

**Fixed** (phase B): `useNavPending` wraps the push in a transition, which does two
things at once. It gives `isPending`, so each filter group disables itself — a `fieldset`,
so the keyboard is covered too — and it keeps the CURRENT screen on display while the
next one is built, rather than replacing it with a skeleton. That division is the whole
design: a spinner on the link for arriving somewhere, a disabled control for changing
what you are already looking at.

### 4. The error page asks for a number it does not have — Medium

`error.tsx` tells the user to report "الرقم أدناه", and for any client-side error there
is no number: `digest` is only set for errors thrown on the server. The console line from
the experiment above reads `[error-boundary] no digest`.

So the one screen a user reaches when something has gone wrong asks them for something
that is not on it.

**Fixed** (phase A): two bodies. With a digest, the text points at it; without one, it
asks the user to say what they were doing instead.

### 5. Unsaved work can be walked away from in silence — Medium

The attendance register already computes `dirty` and shows a "•" next to the count. It
does nothing else with it: the رجوع link is a plain `<Link>`, and there is no guard on
navigation or on closing the tab. The same is true of every form dialog — the Escape key
discards a half-filled student record without a word.

The knowledge is there. Nothing acts on it.

### 6. Validation is server-only; the form stack is installed and unused — Medium

`react-hook-form` and `@hookform/resolvers` are dependencies, `src/shared/ui/form.tsx`
exists, and **nothing imports either**. All thirteen forms read `new FormData(...)` by
hand.

**No client component imports a Zod schema.** CLAUDE.md names Zod as validation "shared
between client and server", and it is shared with nothing: every schema runs on the
server only. So a four-character student name, a malformed phone, a missing field — each
costs a full round trip before the person at the desk is told, and the field they got
wrong is only sometimes marked.

### 7. Every filter change adds history and jumps to the top — Medium

All seven navigations use `router.push`, and none passes `scroll: false`.

Stepping back through a week on the attendance board leaves seven entries in the history,
so the back button no longer means "leave this screen" — it means "undo one date". And
changing a filter from the bottom of a 25-row register throws the page to the top.

**Fixed** (phase C): `useNavPending` uses `router.replace(href, { scroll: false })`. A
filter is a refinement of the screen you are on, not a place you went to.

Pagination is deliberately untouched. Those are real `<Link>`s, and walking back through
pages is what a link is for — mixing the two behaviours on one screen would be worse than
either. The line is: a control that changes what the list SHOWS replaces; a link that
moves you through it pushes.

### 8. Errors are reported three different ways — Low

Inline `<p role="alert">` in ten components, `toast.error` in seven places, and — since
finding 1 — the full-page error boundary. Which one a given failure produces is not
predictable from the failure.

### 9. `revalidate` paths do nothing, and look like they do — Low

Every mutation declares `revalidate: { paths: [...] }`, and every dashboard page is
dynamic, because they all read the session. `revalidatePath` on a route that was never
cached has nothing to invalidate. What actually updates the screen is the
`router.refresh()` the component calls afterwards — in 37 places.

Two mechanisms, one inert, and the inert one is the one that reads as authoritative. The
risk is not today's behaviour; it is the reviewer who sees the paths list, believes it,
and leaves out the refresh.

### 10. Every list is rendered into the DOM twice — Low / perf

`DataTable` renders the mobile card list and the desktop table together and hides one
with CSS. Both are always in the DOM: 25 students means 50 rendered rows.

This is a defensible choice — it is server-render-safe, and `display:none` removes the
hidden copy from the accessibility tree, so screen readers are not affected. The cost is
double the render work on every list, and a test suite that must write `visible=true` on
almost every assertion.

---

## Phases

### Phase A — the failure path (findings 1, 4) — done 2026-09-16

`tests/e2e/failed-save.spec.ts` aborts the POST in flight and asserts what survives: the
dialog still open with its values, the register still marked, and a toast instead of a
new page.

### Phase B — knowing the app is working (findings 2, 3) — done 2026-09-16

Not as planned: `loading.tsx` turned out to trade a security property for a skeleton and
was reverted in favour of `useLinkStatus`. The Suspense boundaries were left alone,
because they are load-bearing for `useSearchParams`. See both findings above.

### Phase C — the URL as state (finding 7) — done 2026-09-16

`tests/e2e/filter-history.spec.ts`: three date steps then ONE press of the browser's back
button leaves the board, and a filter change from the bottom of a list stays where it
was.

### Phase D — forms (findings 5, 6, 8)

Client-side validation from the schemas that already exist, a guard on unsaved work, and
one answer to "where does a failure appear". The largest phase and the least urgent:
nothing here loses data or misleads, it just costs the person at the desk a round trip
and an extra tap.

### Not scheduled (findings 9, 10)

Recorded because they will be noticed and questioned, not because they need changing now.
Finding 9 is a comment-and-delete job that should be done the next time someone touches
`createAction`. Finding 10 is a trade-off that was probably correct.
