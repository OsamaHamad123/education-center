import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * The centre's money across branches (docs/ROADMAP.md, item 2).
 *
 * `/fees` and `/payroll/runs` both refuse "كافة الفروع", correctly — a till belongs to
 * one desk. This screen exists because the consequence was that the OWNER's own question
 * had no screen at all. So the two things worth testing are that it answers that
 * question, and that a branch admin cannot reach it.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the owner's money screen", () => {
  test("lists every branch, and totals the month", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/reports/money");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.money.title);
    // Three seeded branches, all of them on one screen — which is the whole point.
    await expect(page.getByText("فرع مدينة نصر").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("فرع العبور").first()).toBeVisible();
    await expect(page.getByText("فرع الجيزة").first()).toBeVisible();
    await expect(page.getByText(ar.money.net).first()).toBeVisible();
  });

  test("has nothing to press — it reads, it does not collect", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/reports/money");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.money.title);

    // Money is taken and paid out at one desk in one branch. If this screen ever grows
    // a button, that rule has been broken somewhere else first.
    await expect(page.getByRole("button", { name: ar.fees.collect })).toHaveCount(0);
    await expect(page.getByRole("button", { name: ar.payroll.settle })).toHaveCount(0);
  });

  test("404s a branch admin, and does not appear on their reports page", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    await page.goto("/reports");
    // Nothing disabled and nothing hinting that another branch's takings exist.
    await expect(page.getByRole("link", { name: ar.money.title })).toHaveCount(0);

    const response = await page.goto("/reports/money");
    expect(response?.status()).toBe(404);
  });
});
