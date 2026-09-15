import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 7 — attendance, against the seeded database.
 *
 * Repeatability: the seed already marks two weeks of attendance, so these tests mark
 * and re-mark the SAME registers rather than creating new ones. Saving a register is
 * an upsert, so running the suite twice writes the same rows twice — which is exactly
 * the property rule 10.5 asks for, and the reason this suite can prove it.
 */

const PASSWORD = "Password123!";
const TEACHER_PHONE = "01011110001";
const TEACHER_CODE = "123456";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
  // once — 5 seconds is the default, not a budget this navigation was ever meant to
  // fit. A single sign-in against an idle server takes ~0.2s.
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

async function signInAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "معلم" }).click();
  await page.getByLabel("رقم الهاتف").fill(TEACHER_PHONE);
  await page.getByLabel("كود الدخول").fill(TEACHER_CODE);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
}

/**
 * Only the seed's "1" classes have a timetable, so there are exactly two registers to
 * work with in مدينة نصر — one per project. Desktop and mobile run in parallel, and
 * two browsers marking one register interleave into a state neither test asked for.
 */
function markingClass(project: string): string {
  return project === "mobile" ? "أدبي 1 - بنين" : "علمي 1 - بنين";
}

/** Opens the attendance board for one class, by picking it rather than by URL. */
async function openBoard(page: Page, className: string) {
  await page.goto("/attendance");
  await page.getByRole("combobox", { name: "الشعبة" }).click();
  await page.getByRole("option", { name: className, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "الشعبة" })).toContainText(className);
}

/**
 * Opens one numbered period. Tests inside a project also run in parallel, so each
 * claims its own period rather than "the first one".
 */
async function openPeriod(page: Page, periodNumber: number) {
  await page.getByRole("link", { name: new RegExp(`^فتح الحصة ${periodNumber} — `) }).click();
  await expect(page.getByRole("button", { name: "تعليم الكل حاضر" })).toBeVisible();
}

test.describe("the board", () => {
  test("defaults to today and lists the day's periods with their state", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("الحضور");
    // The date field is pre-filled with today; the "next day" arrow is therefore off.
    await expect(page.getByRole("button", { name: "اليوم التالي" })).toBeDisabled();
    await expect(visible(page, /لم تُسجّل|مسجّلة/).first()).toBeVisible();
  });

  test("walks back a day and offers a way home", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));

    const dateField = page.getByLabel("التاريخ").first();
    const today = await dateField.inputValue();

    await page.getByRole("button", { name: "اليوم السابق" }).click();
    await expect(dateField).not.toHaveValue(today);

    await page.getByRole("button", { name: "اليوم", exact: true }).click();
    await expect(dateField).toHaveValue(today);
  });

  test("cannot be walked into the future", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));

    // Marking a register for a lesson that has not happened is not a late edit.
    await expect(page.getByRole("button", { name: "اليوم التالي" })).toBeDisabled();
  });
});

test.describe("marking a register", () => {
  test("marks a whole class present in ONE tap after opening", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));
    await openPeriod(page, 1);

    // Everyone is present before a single tap — that is the design, not a shortcut.
    await expect(visible(page, /^حاضر \d+$/).first()).toBeVisible();
    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();
  });

  test("one tap on a student makes them absent, and it survives a reload", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));
    await openPeriod(page, 2);

    const student = page.getByRole("button", { name: /: حاضر$/ }).first();
    const label = (await student.getAttribute("aria-label")) ?? "";
    const name = label.replace(/: حاضر$/, "");

    // One tap: present → absent. Absent is deliberately first in the cycle.
    await student.click();
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    // Put it back, so the suite is repeatable and the seed stays sane.
    await page.getByRole("button", { name: "تعليم الكل حاضر" }).click();
    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();
  });

  test("cycles present → absent → late → excused → present", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));
    // Period 3 is never SAVED by any test, so cycling here writes nothing at all.
    await openPeriod(page, 3);

    const first = page.getByRole("button", { name: /: (حاضر|غائب|متأخر|بعذر)$/ }).first();
    const label = (await first.getAttribute("aria-label")) ?? "";
    const name = label.replace(/: .+$/, "");

    // Start from a known state without saving anything.
    await page.getByRole("button", { name: "تعليم الكل حاضر" }).click();
    for (const expected of ["غائب", "متأخر", "بعذر", "حاضر"]) {
      await page.getByRole("button", { name: new RegExp(`^${name}: `) }).click();
      await expect(page.getByRole("button", { name: `${name}: ${expected}` })).toBeVisible();
    }
  });

  test("saving twice writes the same rows — the save is idempotent", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Period 4 belongs to the thirty-second test there.");
    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));
    await openPeriod(page, 4);

    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByRole("button", { name: "حفظ الحضور" }).click();
      await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();
    }

    await page.goBack();
    // The counter reads "marked / roster size", not double it.
    const badge = visible(page, /^\d+\/\d+/).first();
    const text = (await badge.textContent()) ?? "";
    const [marked, roster] = text.split("/").map((part) => Number(part.trim()));
    expect(marked).toBe(roster);
  });
});

test.describe("the thirty-second test", () => {
  test("a full class is marked on a 390px screen in well under 30 seconds", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "This is a phone measurement.");
    await page.setViewportSize({ width: 390, height: 844 });

    await signIn(page, "admin_nsr");
    await openBoard(page, markingClass(testInfo.project.name));
    await openPeriod(page, 4);
    await expect(page.getByRole("button", { name: "حفظ الحضور" })).toBeVisible();

    // The clock starts once the register is on screen: what is being measured is the
    // marking, not the sign-in (PROJECT_PLAN Phase 7 acceptance).
    const started = Date.now();

    // A realistic class: three absentees, then save.
    const students = page.getByRole("button", { name: /: حاضر$/ });
    for (let index = 0; index < 3; index++) {
      await students.nth(index).click();
    }
    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();

    const elapsed = (Date.now() - started) / 1000;
    // Recorded, not just asserted: a budget you cannot see drifting is a budget you
    // will one day blow through without noticing.
    testInfo.annotations.push({ type: "elapsed", description: `${elapsed.toFixed(1)}s of 30s` });
    expect(elapsed).toBeLessThan(30);

    await page.getByRole("button", { name: "تعليم الكل حاضر" }).click();
    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();
  });
});

test.describe("the sessions log", () => {
  /**
   * These tests cancel a session, so they work on one they make themselves: an EXTRA
   * session at a period no timetable uses. Re-running the suite on the same day finds
   * it already there and reuses it, so nothing accumulates beyond one row per day.
   */
  const EXTRA_PERIOD = "11";

  async function ensureExtraSession(page: Page, className: string) {
    await openBoard(page, className);
    const existing = page.getByRole("link", { name: new RegExp(`^فتح الحصة ${EXTRA_PERIOD} — `) });
    if ((await existing.count()) > 0) return;

    await page.getByRole("button", { name: "حصة إضافية" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox", { name: "المادة" }).click();
    await page.getByRole("option", { name: "الرياضيات", exact: true }).click();
    await dialog.getByRole("combobox", { name: "المعلم" }).click();
    await page.getByRole("option").first().click();
    await dialog.getByLabel("الحصة").fill(EXTRA_PERIOD);
    await dialog.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, "تمت إضافة الحصة.").first()).toBeVisible();
  }

  test("adds an extra session, then cancels and restores it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One extra session per run: desktop owns it.");
    await signIn(page, "admin_nsr");
    await ensureExtraSession(page, markingClass(testInfo.project.name));

    await page.goto("/attendance/sessions");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("سجل الحصص");
    await expect(visible(page, "إضافية").first()).toBeVisible();

    await page
      .getByRole("button", { name: /^إلغاء الحصة — الرياضيات$/ })
      .first()
      .click();
    await page.getByLabel("سبب الإلغاء").fill("اختبار آلي");
    await page.getByRole("dialog").getByRole("button", { name: "إلغاء الحصة" }).click();
    await expect(visible(page, "تم إلغاء الحصة.").first()).toBeVisible();

    // A cancelled session keeps its attendance and can be brought back — which is what
    // makes this test repeatable at all.
    await page
      .getByRole("button", { name: /^إعادة تفعيل الحصة — الرياضيات$/ })
      .first()
      .click();
    await page.getByRole("button", { name: "إعادة تفعيل الحصة", exact: true }).last().click();
    await expect(visible(page, "تمت إعادة تفعيل الحصة.").first()).toBeVisible();
  });

  test("refuses a cancellation with no reason", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/attendance/sessions");

    await page
      .getByRole("button", { name: /^إلغاء الحصة — / })
      .first()
      .click();
    // The confirm button stays disabled until a real reason is typed.
    await expect(page.getByRole("dialog").getByRole("button", { name: "إلغاء الحصة" })).toBeDisabled();
  });
});

test.describe("branch isolation", () => {
  test("a branch admin is shown only their own branch's classes", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/attendance");

    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await expect(page.getByRole("option", { name: "أدبي 1 - بنين", exact: true })).toBeVisible();
    // Every branch seeds the same class names, so the count is the tell: four, not twelve.
    await expect(page.getByRole("option")).toHaveCount(4);
  });

  test("404s another branch's class instead of explaining it", async ({ page }) => {
    await signIn(page, "admin_giz");
    await openBoard(page, "أدبي 1 - بنين");
    const gizaUrl = page.url();

    await signOut(page);
    await signIn(page, "admin_nsr");
    await page.goto(gizaUrl);

    // Not an error — the class simply is not theirs, so they get their own instead.
    await expect(page.getByRole("combobox", { name: "الشعبة" })).toBeVisible();
    expect(page.url()).not.toBe(gizaUrl);
  });
});

test.describe("the teacher portal", () => {
  test("shows today's lessons and opens a register from one", async ({ page }) => {
    await signInAsTeacher(page);

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("حصص اليوم");
    const lesson = page.getByRole("link", { name: "تسجيل الحضور" }).first();

    // Teachers do not work every day; when they do, the register must open.
    if ((await lesson.count()) === 0) {
      await expect(visible(page, "لا توجد لك حصص اليوم.").first()).toBeVisible();
      return;
    }

    await lesson.click();
    await expect(page.getByRole("button", { name: "حفظ الحضور" })).toBeVisible();
    await page.getByRole("button", { name: "حفظ الحضور" }).click();
    await expect(visible(page, "تم حفظ الحضور.").first()).toBeVisible();
  });

  test("gives a teacher no route into the admin attendance screens", async ({ page }) => {
    await signInAsTeacher(page);

    await page.goto("/attendance/sessions");
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
  });
});
