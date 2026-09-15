import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 — classes and students, against the seeded database.
 *
 * Every test that MUTATES enrols its own student first. The desktop and mobile
 * projects run in parallel against one database, and archiving or transferring a
 * seeded student is not undoable — a suite that only passes on a freshly seeded
 * database is a suite nobody will trust the second time.
 */

const PASSWORD = "Password123!";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

/**
 * The list renders the card layout and the table at once, hiding one per breakpoint,
 * and the header links to /students/archive and /students/new. Take the visible
 * profile link only.
 */
function firstStudentLink(page: Page) {
  return page
    .locator('a[href^="/students/"]:not([href="/students/archive"]):not([href="/students/new"])')
    .locator("visible=true")
    .first();
}

/**
 * /login redirects anyone who is already signed in, so switching users in one test
 * has to drop the session cookie first.
 */
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

/** A super admin must pick a branch before the branch-scoped screens will write. */
async function selectBranch(page: Page, branchName: string) {
  await page.getByRole("combobox", { name: "تبديل الفرع" }).click();
  await page.getByRole("option", { name: branchName }).click();
  await expect(visible(page, "الفرع النشط:").first()).toBeVisible();
}

/** Unique per call, so two parallel projects never collide on the duplicate check. */
function randomEgyptianPhone(): string {
  return `010${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}

/** Enrols a throwaway student and returns their profile URL. */
async function enrolStudent(page: Page, label: string): Promise<string> {
  await page.goto("/students/new");
  await page.getByLabel("الاسم").fill(`طالب اختبار ${label} المصري`);
  await page.getByLabel("هاتف ولي الأمر").fill(randomEgyptianPhone());
  await page.getByRole("button", { name: "حفظ" }).click();

  await expect(page).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
  return page.url();
}

test.describe("students list", () => {
  test("shows the branch's students and searches by code", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/students");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("الطلاب");

    // A seeded student this suite never mutates, so the count stays 1.
    await page.goto("/students?search=NSR-26-00001");
    await expect(visible(page, "NSR-26-00001").first()).toBeVisible();
    await expect(visible(page, "الإجمالي: 1").first()).toBeVisible();
  });

  test("a profile shows the enrollment history, and no transfer button for a branch admin", async ({
    page,
  }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/students?search=NSR-26-00002");
    await firstStudentLink(page).click();

    await expect(visible(page, "ملف الطالب").first()).toBeVisible();
    await expect(visible(page, "سجل القيد").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "نقل إلى شعبة أخرى" })).toBeVisible();
    await expect(page.getByRole("button", { name: "نقل إلى فرع آخر" })).toHaveCount(0);
  });
});

test.describe("enrolling", () => {
  test("issues a student code and opens an enrollment", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await enrolStudent(page, `${testInfo.project.name}${testInfo.workerIndex}`);

    // The code carries the branch prefix and the two-digit year (7.5).
    await expect(visible(page, /^NSR-\d{2}-\d{5}$/).first()).toBeVisible();
    await expect(visible(page, "سجل القيد").first()).toBeVisible();
  });

  test("rejects a phone that is not an Egyptian mobile", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/students/new");

    await page.getByLabel("الاسم").fill("طالب برقم خاطئ جداً");
    await page.getByLabel("هاتف ولي الأمر").fill("0221234567");
    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(visible(page, "رقم موبايل مصري غير صالح").first()).toBeVisible();
  });
});

test.describe("enrollment transitions", () => {
  test("changing class closes one enrollment and opens another", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    await enrolStudent(page, `شعبة${testInfo.project.name}${testInfo.workerIndex}`);

    await page.getByRole("button", { name: "نقل إلى شعبة أخرى" }).click();
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "تأكيد" }).click();

    await expect(visible(page, "تم نقل الطالب إلى الشعبة الجديدة.").first()).toBeVisible();
    // The closed row now carries the reason it was closed.
    await expect(visible(page, "تغيير شعبة").first()).toBeVisible();
  });

  test("archiving requires a reason, and restoring brings them back", async ({ page }, testInfo) => {
    await signIn(page, "admin_nsr");
    const profileUrl = await enrolStudent(page, `أرشفة${testInfo.project.name}${testInfo.workerIndex}`);

    await page.getByRole("button", { name: "أرشفة الطالب" }).click();
    await page.getByLabel("سبب المغادرة").fill("سفر خارج البلاد");
    await page.getByRole("button", { name: "أرشفة الطالب" }).last().click();
    await expect(visible(page, "تمت أرشفة الطالب.").first()).toBeVisible();
    await expect(visible(page, "مغادرة").first()).toBeVisible();

    await page.goto(profileUrl);
    await page.getByRole("button", { name: "استعادة الطالب" }).click();
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "تأكيد" }).click();
    await expect(visible(page, "تمت استعادة الطالب.").first()).toBeVisible();
  });
});

test.describe("branch transfer (super admin only)", () => {
  test("keeps the code, and leaves the old branch a read-only record", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    await selectBranch(page, "فرع مدينة نصر");

    const profileUrl = await enrolStudent(page, `فرع${testInfo.project.name}${testInfo.workerIndex}`);
    const code = await visible(page, /^NSR-\d{2}-\d{5}$/)
      .first()
      .innerText();

    await page.getByRole("button", { name: "نقل إلى فرع آخر" }).click();
    await page.getByRole("combobox", { name: "الفرع" }).click();
    await page.getByRole("option", { name: "فرع العبور" }).click();
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "تأكيد" }).click();

    await expect(visible(page, "تم نقل الطالب إلى الفرع الجديد.").first()).toBeVisible();
    // The code is the student's identity and survives the move (rule 10.3) — it still
    // carries the prefix of the branch they came FROM.
    await expect(visible(page, code).first()).toBeVisible();
    await expect(visible(page, "نقل لفرع آخر").first()).toBeVisible();

    // The branch they left still sees them, marked as transferred out, with no
    // controls to change anything.
    await signOut(page);
    await signIn(page, "admin_nsr");
    await page.goto(profileUrl);
    await expect(visible(page, "منقول").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "أرشفة الطالب" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "نقل إلى شعبة أخرى" })).toHaveCount(0);
  });
});

test.describe("classes", () => {
  test("locks the track once the class has run sessions (rule 10.2)", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/classes");

    await page
      .getByRole("button", { name: /^تعديل / })
      .first()
      .click();
    await expect(page.getByRole("combobox", { name: "المسار" })).toBeDisabled();
    await expect(visible(page, "لا يمكن تغيير المسار بعد تنفيذ حصص").first()).toBeVisible();
  });

  test("refuses to deactivate a class that still has students", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/classes");

    await page
      .getByRole("button", { name: /^تعطيل / })
      .first()
      .click();
    await page.getByRole("button", { name: "تعطيل", exact: true }).last().click();

    await expect(visible(page, "لا يمكن تعطيل شعبة بها طلاب نشطون").first()).toBeVisible();
  });
});

test.describe("isolation", () => {
  test("a branch admin cannot find another branch's student, by code or by id", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // By code: the search returns nothing — no hint that it exists elsewhere.
    await page.goto("/students?search=OBR-26-00001");
    await expect(visible(page, "لا يوجد طلاب مطابقون").first()).toBeVisible();

    // By id: an id they may not read is a 404 — the same answer a nonexistent one gives.
    await page.goto("/students/00000000-0000-4000-8000-000000000000");
    await expect(page.getByText("404")).toBeVisible();
  });
});
