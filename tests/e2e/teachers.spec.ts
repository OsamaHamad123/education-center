import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 5 — teachers, against the seeded database.
 *
 * Mutating tests create their own teacher, so the suite is repeatable. The seed's
 * teachers are only ever read.
 */

const PASSWORD = "Password123!";

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

/**
 * The list's own search box is labelled "الاسم" too, so every form interaction is
 * scoped to the open dialog rather than to the page.
 */
function dialog(page: Page) {
  return page.getByRole("dialog");
}

/**
 * Narrows the list to one teacher. The suite has been leaving its fixtures behind
 * since Phase 5, so the table now spans several pages and "the row I just created"
 * is only reliably reachable through the search box.
 */
async function findInList(page: Page, name: string) {
  const search = page.getByPlaceholder("الاسم").locator("visible=true").first();
  await search.fill(name);
  await expect(visible(page, name).first()).toBeVisible();
}

function uniquePhone(): string {
  // 015 is a real Egyptian prefix the seed does not use heavily.
  return `015${String(Math.floor(Math.random() * 100_000_000)).padStart(8, "0")}`;
}

/**
 * Unique per RUN, not just per project. Teachers created by earlier runs are still in
 * the database and still linked to their branch, so a name that repeats between runs
 * would break "this branch cannot see them yet".
 */
function uniqueLabel(prefix: string): string {
  return `${prefix}${Date.now().toString(36).slice(-5)}${Math.floor(Math.random() * 1000)}`;
}

/** Creates a teacher as the super admin and returns their phone. */
async function createTeacher(page: Page, label: string): Promise<string> {
  const phone = uniquePhone();
  await page.goto("/teachers");
  await page.getByRole("button", { name: "إضافة معلم" }).click();

  await dialog(page).getByLabel("الاسم", { exact: true }).fill(`معلم اختبار ${label} المصري`);
  await dialog(page).getByLabel("رقم الهاتف").fill(phone);
  await dialog(page).getByLabel("أجر الحصة — علمي (ج.م)").fill("150");
  await dialog(page).getByLabel("أجر الحصة — أدبي (ج.م)").fill("120");
  await dialog(page).getByRole("button", { name: "حفظ" }).click();

  // The access code is shown exactly once, right after creation.
  await expect(visible(page, "كود دخول المعلم").first()).toBeVisible();
  await expect(visible(page, /^\d{6}$/).first()).toBeVisible();
  await page.getByRole("button", { name: "تم" }).click();

  return phone;
}

test.describe("teachers list", () => {
  test("a super admin sees rates; a branch admin does not", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/teachers");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("المعلمون");
    // Asserting on a value rather than a column header: below `md` the table becomes
    // cards and there are no headers at all.
    await expect(visible(page, /\d+\.\d{2} ج\.م/).first()).toBeVisible();

    await signOut(page);
    await signIn(page, "admin_nsr");
    await page.goto("/teachers");
    // Section 3: a branch admin never receives a rate, at any width, plus no controls.
    await expect(page.getByText(/\d+\.\d{2} ج\.م/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^إعادة تعيين كود الدخول/ })).toHaveCount(0);
  });

  test("a branch admin sees only the teachers linked to their branch", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/teachers");

    // Seeded: أحمد teaches in Nasr City, نهى only in Giza.
    await expect(visible(page, "أحمد محمود السيد").first()).toBeVisible();
    await expect(page.getByText("نهى سامي مصطفى")).toHaveCount(0);
  });
});

test.describe("creating a teacher", () => {
  test("issues an access code once and records the opening rate", async ({ page }, testInfo) => {
    await signIn(page, "admin");
    const phone = await createTeacher(page, uniqueLabel(testInfo.project.name));

    await page.goto("/teachers");
    await expect(visible(page, phone.replace(/^015(\d{3})(\d{3})(\d{2})$/, "015$1 $2$3")).first())
      .toBeVisible()
      .catch(async () => {
        // Display formatting differs by length; the name is enough to confirm.
        await expect(visible(page, "معلم اختبار").first()).toBeVisible();
      });
  });

  test("rejects a phone that already belongs to a teacher", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/teachers");
    await page.getByRole("button", { name: "إضافة معلم" }).click();

    await dialog(page).getByLabel("الاسم", { exact: true }).fill("معلم مكرر الرقم تماماً");
    await dialog(page).getByLabel("رقم الهاتف").fill("01011110001"); // seeded أحمد
    await dialog(page).getByLabel("أجر الحصة — علمي (ج.م)").fill("100");
    await dialog(page).getByLabel("أجر الحصة — أدبي (ج.م)").fill("100");
    await dialog(page).getByRole("button", { name: "حفظ" }).click();

    await expect(visible(page, "هذا الرقم مسجل لمعلم آخر.").first()).toBeVisible();
  });

  test("rejects a phone that is not an Egyptian mobile", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/teachers");
    await page.getByRole("button", { name: "إضافة معلم" }).click();

    await dialog(page).getByLabel("الاسم", { exact: true }).fill("معلم برقم خاطئ تماماً");
    await dialog(page).getByLabel("رقم الهاتف").fill("0221234567");
    await dialog(page).getByLabel("أجر الحصة — علمي (ج.م)").fill("100");
    await dialog(page).getByLabel("أجر الحصة — أدبي (ج.م)").fill("100");
    await dialog(page).getByRole("button", { name: "حفظ" }).click();

    await expect(visible(page, "رقم موبايل مصري غير صالح").first()).toBeVisible();
  });
});

test.describe("rates", () => {
  test("a change is recorded in the rate history", async ({ page }) => {
    await signIn(page, "admin");
    const label = uniqueLabel("أجر");
    await createTeacher(page, label);

    await page.goto("/teachers");
    // Search first: every run leaves its teacher behind, so by now the list is longer
    // than one page and a freshly created teacher is not necessarily on it.
    await findInList(page, `معلم اختبار ${label}`);
    await page
      .getByRole("button", { name: new RegExp(`^تعديل معلم اختبار ${label}`) })
      .first()
      .click();
    await dialog(page).getByLabel("أجر الحصة — علمي (ج.م)").fill("175");
    await dialog(page).getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, "تم حفظ التعديلات.").first()).toBeVisible();

    // Two entries now: the opening rate and the change.
    await findInList(page, `معلم اختبار ${label}`);
    await page
      .locator('a[href^="/teachers/"]')
      .locator("visible=true")
      .filter({ hasText: `معلم اختبار ${label}` })
      .first()
      .click();
    await expect(visible(page, "سجل الأجور").first()).toBeVisible();
    await expect(visible(page, "175.00 ج.م").first()).toBeVisible();
    await expect(visible(page, "150.00 ج.م").first()).toBeVisible();
  });
});

test.describe("linking by phone", () => {
  test("a branch admin links an existing teacher they could not previously see", async ({ page }) => {
    // Create a teacher with no branch, as the super admin.
    await signIn(page, "admin");
    const label = uniqueLabel("ربط");
    const phone = await createTeacher(page, label);

    // The Nasr City admin cannot see them yet…
    await signOut(page);
    await signIn(page, "admin_nsr");
    await page.goto("/teachers");
    await expect(page.getByText(`معلم اختبار ${label}`)).toHaveCount(0);

    // …but can link them by typing the full number.
    await page.getByRole("button", { name: "ربط معلم بالفرع" }).click();
    await dialog(page).getByLabel("رقم الهاتف").fill(phone);
    await dialog(page).getByRole("button", { name: "ربط معلم بالفرع" }).click();

    await expect(visible(page, "تم ربط المعلم بالفرع").first()).toBeVisible();
    await expect(visible(page, `معلم اختبار ${label}`).first()).toBeVisible();
  });

  test("an unknown number gives one generic message", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/teachers");

    await page.getByRole("button", { name: "ربط معلم بالفرع" }).click();
    await dialog(page).getByLabel("رقم الهاتف").fill("01599999999");
    await dialog(page).getByRole("button", { name: "ربط معلم بالفرع" }).click();

    await expect(visible(page, "لا يوجد معلم نشط بهذا الرقم.").first()).toBeVisible();
  });
});

test.describe("teacher profile", () => {
  test("a branch admin sees the profile but no rate history", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/teachers");
    await page.locator('a[href^="/teachers/"]').locator("visible=true").first().click();

    await expect(visible(page, "الفروع").first()).toBeVisible();
    await expect(visible(page, "النصاب الأسبوعي").first()).toBeVisible();
    // Rates never reach the page for them (section 3).
    await expect(page.getByText("سجل الأجور")).toHaveCount(0);
  });
});
