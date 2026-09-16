import { expect, test, type Page } from "@playwright/test";

/**
 * Audit phase E — consistency (docs/AUDIT-2026-09.md, findings 8 and 10).
 *
 * Nothing here was exploitable on its own. Each is a place where one part of the
 * product did not do what the rest of it does, and the tests are written to hold both
 * halves: the gate closes, and the door that was always meant to be open stays open.
 */

const PASSWORD = "Password123!";

/** The search is a form: typing does nothing until it is submitted. */
async function searchFor(page: Page, term: string) {
  const box = page.getByPlaceholder("ابحث بالاسم أو الكود أو رقم ولي الأمر").locator("visible=true").first();
  await box.fill(term);
  await box.press("Enter");
}

async function signInAsAdmin(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

async function signInAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "معلم" }).click();
  await page.getByLabel("رقم الهاتف").fill("01011110001");
  await page.getByLabel("كود الدخول").fill("123456");
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
}

test.describe("the print area and the teacher", () => {
  test("closes the payroll sheet, which is the office's document", async ({ page }) => {
    // RLS kept this to the teacher's own rows, so nothing leaked — but it was the one
    // route group with no role gate, and the sheet has a signature column on it.
    await signInAsTeacher(page);
    const response = await page.goto("/print/payroll");
    expect(response?.status()).toBe(404);
  });

  test("leaves their own week open, which is why there is no blanket redirect", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/teacher/timetable");

    const printLink = page.getByRole("link", { name: /طباعة/ }).first();
    const href = await printLink.getAttribute("href");
    expect(href).toMatch(/^\/print\/timetable\/teacher\//);

    const response = await page.goto(href as string);
    expect(response?.status()).toBe(200);
  });

  test("still refuses another teacher's week", async ({ page }) => {
    await signInAsTeacher(page);
    const response = await page.goto("/print/timetable/teacher/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });

  test("an admin can still print the payroll sheet", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");
    const response = await page.goto("/print/payroll");
    expect(response?.status()).toBe(200);
  });
});

test.describe("the search box", () => {
  test("searches for a percent sign instead of matching everyone", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");
    await page.goto("/students");

    await searchFor(page, "%");

    // `%` is pattern syntax, so this used to return the whole register.
    await expect(page.getByText("لا يوجد طلاب مطابقون.").locator("visible=true").first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("still finds a student by a real fragment of their code", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");
    await page.goto("/students");

    await searchFor(page, "NSR-26-00001");

    await expect(page.getByText("NSR-26-00001").locator("visible=true").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
