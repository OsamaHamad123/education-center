import { expect, test, type Page } from "@playwright/test";

/**
 * UX audit phase D — forms (docs/UX-AUDIT-2026-09.md, findings 5 and 6).
 *
 * The validation tests assert that the answer arrives WITHOUT a request, because that is
 * the whole change: the schemas were always there and only ever ran on the server, so
 * every typo cost a round trip before the person at the desk was told about it.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

/** Counts server-action POSTs, which is how "no round trip" is proved. */
function countActions(page: Page, path: string) {
  const state = { count: 0 };
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes(path)) state.count += 1;
  });
  return state;
}

test.describe("a form checks before it asks the server", () => {
  test("refuses a short class name without sending anything", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/classes");

    const posts = countActions(page, "/classes");

    await page.getByRole("button", { name: "إضافة شعبة" }).first().click();
    await page.locator("#class-name").fill("أ");
    await page.locator("[name=gradeLevel]").first().fill("الثالث الثانوي");
    await page.getByRole("button", { name: "حفظ" }).click();

    // The message is the schema's own, so it is the same one the server would have sent.
    await expect(page.getByText("اسم الشعبة مطلوب")).toBeVisible({ timeout: 10_000 });
    expect(posts.count, "nothing should have been sent").toBe(0);
  });

  test("refuses a phone that is not an Egyptian mobile, still without sending", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/students/new");
    await expect(page.locator("[name=fullName]")).toBeVisible();

    const posts = countActions(page, "/students/new");

    await page.locator("[name=fullName]").fill("محمد أحمد السيد علي");
    await page.locator("[name=parentPhone]").fill("12345");
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(page.getByText("رقم موبايل مصري غير صالح")).toBeVisible({ timeout: 10_000 });
    expect(posts.count, "nothing should have been sent").toBe(0);
  });

  test("still lets a valid form through to the server", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: it creates a subject.");
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/subjects");

    const name = `مادة اختبار ${Date.now().toString(36)}`;
    await page.getByRole("button", { name: "إضافة مادة" }).first().click();
    await page.locator("[name=name]").fill(name);
    await page.getByRole("button", { name: "حفظ" }).click();

    // The guard must not become a wall: a good payload reaches the action as before.
    await expect(page.getByText("تمت إضافة المادة.")).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("a register with unsaved marks", () => {
  test("asks before letting you walk away from it", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: it opens a register.");
    test.setTimeout(120_000);

    await signIn(page, "admin_nsr");
    await page.goto("/attendance");
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option", { name: "علمي 1 - بنين", exact: true }).click();
    await page.getByRole("link", { name: /^فتح الحصة 1 — / }).click();
    await expect(page.getByRole("button", { name: "تعليم الكل حاضر" })).toBeVisible();

    // Nothing marked yet: the back button must not nag.
    let asked = false;
    page.on("dialog", (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await page.getByRole("link", { name: "رجوع" }).click();
    await expect(page).toHaveURL(/\/attendance\?/, { timeout: 20_000 });
    expect(asked, "a clean register should not ask").toBe(false);

    // Now mark somebody, and it should.
    await page.goBack();
    await expect(page.getByRole("button", { name: "تعليم الكل حاضر" })).toBeVisible();
    await page
      .getByRole("button", { name: /: حاضر$/ })
      .first()
      .click();

    await page.getByRole("link", { name: "رجوع" }).click();
    await expect.poll(() => asked, { timeout: 10_000 }).toBe(true);
    // Dismissed, so the marks are still here.
    await expect(page).toHaveURL(/\/attendance\/mark/);
  });
});
