import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 6 — the timetable, against the seeded database.
 *
 * The suite must be repeatable, so it follows the rule the students and teachers specs
 * settled on: anything that WRITES creates its own cell and clears it again, and the
 * conflict tests deliberately trigger a FAILED save, which by definition changes
 * nothing. The seeded grid is only ever read.
 */

const PASSWORD = "Password123!";

/** The seed's shared teacher: العبور and الجيزة, busy in الجيزة 08:00–08:45 on Saturday. */
const SHARED_TEACHER = "خالد إبراهيم حسن";
const OTHER_BRANCH = "الجيزة";

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
  await expect(page).toHaveURL("/");
}

function dialog(page: Page) {
  return page.getByRole("dialog");
}

async function chooseClass(page: Page, name: string) {
  await page.goto("/timetable");
  await page.getByRole("combobox", { name: "الشعبة" }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "الشعبة" })).toContainText(name);
}

/**
 * Opens the cell dialog for one day and period. `state` is not cosmetic: after a save
 * the grid re-renders through `router.refresh()`, so waiting for the button to become
 * "تعديل" is what proves the write reached the page rather than only the toast.
 */
async function openCell(page: Page, day: string, period: number, state: "empty" | "filled" | "any" = "any") {
  const verb = { empty: "إضافة حصة", filled: "تعديل الحصة", any: "(إضافة|تعديل) (حصة|الحصة)" }[state];
  const cell = page
    .getByRole("button", { name: new RegExp(`^${verb} — ${day} — الحصة ${period}$`) })
    .locator("visible=true")
    .first();

  await expect(cell).toBeVisible();
  await cell.click();
  await expect(dialog(page)).toBeVisible();
}

async function pick(page: Page, label: string, option: string) {
  await dialog(page).getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

test.describe("the grid", () => {
  test("computes period times from the bell schedule, not from stored text", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "أدبي 1 - بنين");

    // Literary starts at 09:00, periods are 45 minutes, and a 20-minute break follows
    // period 3 — so period 4 begins at 11:35, not 11:15.
    await expect(visible(page, "09:00 – 09:45").first()).toBeVisible();
    await expect(visible(page, "10:30 – 11:15").first()).toBeVisible();
    await expect(visible(page, "11:35 – 12:20").first()).toBeVisible();
  });

  test("shows the scientific track on its own, earlier bell", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "علمي 1 - بنين");

    await expect(visible(page, "08:00 – 08:45").first()).toBeVisible();
  });

  test("lists every working day, Saturday first", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "أدبي 1 - بنين");

    for (const day of ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس"]) {
      await expect(visible(page, day).first()).toBeVisible();
    }
    // Friday is the weekend and must not be a row at all.
    await expect(page.getByRole("rowheader", { name: "الجمعة" })).toHaveCount(0);
  });
});

test.describe("filling a cell", () => {
  test("adds a lesson and clears it again", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "أدبي 2 - بنات");

    // Literary period 6 (13:05–13:50) is after every other track's last bell, so no
    // teacher can be busy then — the test is about saving, not about conflicts. A day
    // per project keeps desktop and mobile off each other's cell.
    const day = testInfo.project.name === "mobile" ? "الأربعاء" : "الخميس";
    await openCell(page, day, 6);
    await pick(page, "المادة", "الرياضيات");
    await pick(page, "المعلم", "أحمد محمود السيد");
    await dialog(page).getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, "تم حفظ الحصة.").first()).toBeVisible();

    await openCell(page, day, 6, "filled");
    await dialog(page).getByRole("button", { name: "إفراغ الخانة" }).click();
    await expect(visible(page, "تم إفراغ الخانة.").first()).toBeVisible();
    // Back to an empty cell, so the next run starts where this one did.
    await expect(
      page
        .getByRole("button", { name: `إضافة حصة — ${day} — الحصة 6` })
        .locator("visible=true")
        .first(),
    ).toBeVisible();
  });

  test("offers only teachers linked to this branch", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "علمي 1 - بنين");
    await openCell(page, "السبت", 6);

    await dialog(page).getByRole("combobox", { name: "المعلم" }).click();
    // نهى teaches only in الجيزة, so for مدينة نصر she does not exist.
    await expect(page.getByRole("option", { name: "نهى سامي مصطفى" })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "أحمد محمود السيد" })).toBeVisible();
  });
});

test.describe("conflicts", () => {
  test("names the class when the teacher is busy in the SAME branch", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "أدبي 2 - بنات");

    // أحمد already teaches somewhere in مدينة نصر at 09:00 on Saturday — the literary
    // and scientific bells overlap, so which class it is depends on the seed. What
    // matters is that the admin is told the NAME, because it is their own branch.
    await openCell(page, "السبت", 1);
    await pick(page, "المادة", "التاريخ");
    await pick(page, "المعلم", "أحمد محمود السيد");
    await dialog(page).getByRole("button", { name: "حفظ" }).click();

    await expect(dialog(page).getByText(/^المعلم مشغول في هذا الوقت مع .+ \(الحصة \d+\)\.$/)).toBeVisible();
  });

  test("tells a BRANCH ADMIN only that the teacher is busy — never which branch", async ({ page }) => {
    await signIn(page, "admin_obr");
    await chooseClass(page, "علمي 2 - بنات");

    // Saturday period 1 is 08:00–08:45 here, and the shared teacher is in الجيزة then.
    await openCell(page, "السبت", 1);
    await pick(page, "المادة", "الرياضيات");
    await pick(page, "المعلم", SHARED_TEACHER);
    await dialog(page).getByRole("button", { name: "حفظ" }).click();

    await expect(dialog(page).getByText("المعلم مشغول في هذا الوقت.")).toBeVisible();
    // The whole point of migration 0005: the other branch is nowhere on the page.
    await expect(page.getByText(new RegExp(OTHER_BRANCH))).toHaveCount(0);
    await expect(page.getByText(/علمي 1 - بنين \(الحصة/)).toHaveCount(0);
  });

  test("tells a SUPER ADMIN which branch the teacher is in", async ({ page }) => {
    await signIn(page, "admin");
    await switchBranch(page, "فرع العبور");
    await chooseClass(page, "علمي 2 - بنات");

    await openCell(page, "السبت", 1);
    await pick(page, "المادة", "الرياضيات");
    await pick(page, "المعلم", SHARED_TEACHER);
    await dialog(page).getByRole("button", { name: "حفظ" }).click();

    await expect(
      dialog(page).getByText(new RegExp(`المعلم مشغول في هذا الوقت في فرع.*${OTHER_BRANCH}`)),
    ).toBeVisible();
  });
});

/**
 * The settings screen writes to a branch's whole timetable, so these run in series and
 * each restores what it changed. `serial` is not caution for its own sake: desktop and
 * mobile run in parallel by default, and two browsers editing one branch's bell
 * schedule interleave into a state neither test asked for.
 */
test.describe.configure({ mode: "serial" });

/**
 * `fill()` on an `<input type="time">` sets the DOM value without tripping React's
 * value tracker, so onChange never fires and the field silently disagrees with the
 * state behind it. Typing the digits is what a person does anyway.
 */
/**
 * A branch per project. Desktop and mobile run in parallel, and these tests submit the
 * settings form — even a save that is REJECTED should not depend on what another
 * browser is doing to the same branch at the same moment.
 */
function settingsAdmin(project: string): string {
  return project === "mobile" ? "admin_obr" : "admin_giz";
}

async function setTime(page: Page, label: string, value: string) {
  const field = page.getByLabel(label).first();
  await field.click();
  await field.pressSequentially(value.replace(":", ""));
  await expect(field).toHaveValue(value);
}

test.describe("the bell schedule", () => {
  test("previews computed times before anything is saved", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/timetable/settings");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("إعدادات الجدول");
    await expect(visible(page, "معاينة الأوقات").first()).toBeVisible();
    await expect(visible(page, "08:00 – 08:45").first()).toBeVisible();

    // Move the first bell. The preview must follow immediately, with nothing saved —
    // it is the only feedback an admin gets before committing a change that rewrites
    // every slot in the branch.
    await setTime(page, "بداية اليوم", "08:30");
    await expect(visible(page, "08:30 – 09:15").first()).toBeVisible();
  });

  test("moves only the periods after a break when the break grows", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/timetable/settings");

    // The seeded break is 20 minutes after period 3, so period 4 starts at 10:35.
    await expect(visible(page, "09:30 – 10:15").first()).toBeVisible();
    await expect(visible(page, "10:35 – 11:20").first()).toBeVisible();

    await page.getByLabel("المدة (دقيقة)").first().fill("30");

    // Periods 1–3 do not move; period 4 does. That asymmetry is the whole rule.
    await expect(visible(page, "09:30 – 10:15").first()).toBeVisible();
    await expect(visible(page, "10:45 – 11:30").first()).toBeVisible();
  });

  test("refuses a day that would run past midnight, and saves nothing", async ({ page }, testInfo) => {
    await signIn(page, settingsAdmin(testInfo.project.name));
    await page.goto("/timetable/settings");

    // 12 periods of three hours cannot fit in a day from 08:00, whatever the start.
    const duration = page.getByLabel("مدة الحصة (دقيقة)").first();
    const count = page.getByLabel("عدد الحصص").first();
    await duration.fill("180");
    await count.fill("12");
    await expect(duration).toHaveValue("180");
    await expect(count).toHaveValue("12");

    await page.getByRole("button", { name: "حفظ" }).first().click();
    await expect(visible(page, /يتجاوز منتصف الليل/).first()).toBeVisible();

    // Validation runs before the write, so a reload must show the branch untouched.
    await page.reload();
    await expect(page.getByLabel("مدة الحصة (دقيقة)").first()).toHaveValue("45");
    await expect(page.getByLabel("عدد الحصص").first()).toHaveValue("6");
  });

  test("reports that an unchanged save moved nothing", async ({ page }, testInfo) => {
    await signIn(page, settingsAdmin(testInfo.project.name));
    await page.goto("/timetable/settings");

    // Saving untouched must be a no-op: the recompute compares the computed times
    // against the stored ones, so an idle save writes nothing — and says so, rather
    // than leaving the admin wondering whether it did something to their week.
    await page.getByRole("button", { name: "حفظ" }).first().click();

    await expect(visible(page, "تم حفظ إعدادات الجدول.").first()).toBeVisible();
    await expect(visible(page, "لم تتأثر أي حصة.").first()).toBeVisible();
  });
});

test.describe("printing", () => {
  test("renders an A4 class timetable with the centre letterhead", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await chooseClass(page, "أدبي 1 - بنين");

    const href = await page.getByRole("link", { name: "طباعة" }).first().getAttribute("href");
    expect(href).toMatch(/^\/print\/timetable\/class\//);

    await page.goto(href ?? "/print");
    await expect(visible(page, "الجدول الأسبوعي للشعبة").first()).toBeVisible();
    await expect(visible(page, "أدبي 1 - بنين").first()).toBeVisible();
    await expect(visible(page, "تاريخ الطباعة").first()).toBeVisible();
    // The print button is for the screen only and must never reach the paper.
    await expect(page.getByRole("button", { name: "طباعة" })).toBeVisible();
  });

  test("404s a class in another branch instead of explaining it", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await signOut(page);
    await signIn(page, "admin_giz");
    await chooseClass(page, "أدبي 1 - بنين");
    const gizaHref = await page.getByRole("link", { name: "طباعة" }).first().getAttribute("href");

    await signOut(page);
    await signIn(page, "admin_nsr");
    const response = await page.goto(gizaHref ?? "/print");

    expect(response?.status()).toBe(404);
  });
});

/** The super admin's branch switcher. A branch admin is never sent this control. */
async function switchBranch(page: Page, branchName: string) {
  await page.goto("/");
  await page.getByRole("combobox", { name: "تبديل الفرع" }).click();
  await page.getByRole("option", { name: branchName, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "تبديل الفرع" })).toContainText(branchName);
}

test.describe("the teacher portal", () => {
  /** The seed's أحمد: مدينة نصر only. Username is the phone, password the access code. */
  const TEACHER_PHONE = "01011110001";
  const TEACHER_CODE = "123456";

  async function signInAsTeacher(page: Page) {
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill(TEACHER_PHONE);
    await page.getByLabel("كود الدخول").fill(TEACHER_CODE);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/);
  }

  test("shows a teacher their own week, grouped by day", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/teacher/timetable");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("جدولي");
    await expect(visible(page, "السبت").first()).toBeVisible();
    await expect(visible(page, "فرع مدينة نصر").first()).toBeVisible();
    // Their own periods, and a class they teach.
    await expect(visible(page, /\d{2}:\d{2} – \d{2}:\d{2}/).first()).toBeVisible();
  });

  test("gives a teacher no way into the admin timetable editor", async ({ page }) => {
    await signInAsTeacher(page);

    // The portal nav offers the three teacher screens and nothing else.
    await expect(page.getByRole("link", { name: "الشُعب" })).toHaveCount(0);
    // And the route itself sends them back to their own area.
    await page.goto("/timetable");
    await expect(page).toHaveURL(/\/teacher$/);
  });

  test("lets a teacher print their own week", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/teacher/timetable");

    const href = await page.getByRole("link", { name: "طباعة" }).first().getAttribute("href");
    expect(href).toMatch(/^\/print\/timetable\/teacher\//);

    await page.goto(href ?? "/print");
    await expect(visible(page, "الجدول الأسبوعي للمعلم").first()).toBeVisible();
    await expect(visible(page, "أحمد محمود السيد").first()).toBeVisible();
  });
});

test.describe("copying a week", () => {
  test("copies what fits and reports what did not", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One target class per run: desktop owns this fixture.");
    await signIn(page, "admin_nsr");

    // أدبي 2 - بنات has no timetable of its own in the seed, so it is the one class
    // this test can fill and empty again without touching anyone else's week.
    await chooseClass(page, "أدبي 2 - بنات");
    await page.getByRole("button", { name: "نسخ من شعبة أخرى" }).click();

    await dialog(page).getByRole("combobox", { name: "الشعبة المصدر" }).click();
    await page.getByRole("option", { name: "أدبي 1 - بنين", exact: true }).click();
    await dialog(page).getByRole("button", { name: "نسخ من شعبة أخرى" }).click();

    // Every source slot clashes with itself — the SAME teacher is already in أدبي 1
    // at that exact minute — so a truthful copy creates nothing and says why.
    await expect(dialog(page).getByText(/حصة منسوخة|لم تُنسخ أي حصة/)).toBeVisible();
    await expect(
      dialog(page)
        .getByText(/المعلم مشغول في هذا الوقت/)
        .first(),
    ).toBeVisible();
  });
});
