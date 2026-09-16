import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * The academic calendar (§16 question 7; docs/ROADMAP.md, item 4).
 *
 * A term is a NAMED DATE RANGE and nothing else, so the tests that matter are the ones
 * that prove it stayed that small: picking one writes plain dates into the URL, the
 * report itself never learns a new concept, and a centre with no calendar sees no
 * picker at all.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the calendar on the settings screen", () => {
  test("lists the seeded terms and marks today's", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/settings");

    await expect(page.getByText(ar.terms.title).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/الفصل الدراسي الأول/).first()).toBeVisible();
    // Which one is TODAY's is the interesting thing about the screen: it is the one the
    // reports offer and the one the lookup's "الفصل" figure now means.
    await expect(page.getByText(ar.terms.current).first()).toBeVisible();
  });

  test("refuses a term that overlaps another, and says why", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/settings");

    await page.getByRole("button", { name: ar.terms.add }).click();
    await page.locator("#name").fill("فصل متداخل");
    // Deliberately inside the seeded first term. "The current term" must have exactly
    // one answer, and the refusal has to arrive in Arabic rather than as a constraint.
    const year = new Date().getFullYear();
    await page.locator("#term-start").fill(`01/10/${year}`);
    await page.locator("#term-end").fill(`01/11/${year}`);
    await page.getByRole("button", { name: ar.common.save }).click();

    await expect(page.getByRole("alert").first()).toContainText(ar.terms.problems.OVERLAPS, {
      timeout: 20_000,
    });
  });

  test("is read-only for a branch admin", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    // Settings is a super-admin screen; a branch admin is turned away from it entirely.
    const response = await page.goto("/settings");
    expect(response?.status()).toBe(404);
  });
});

test.describe("a term as a date preset", () => {
  test("fills the report's dates, and leaves plain dates in the URL", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/reports/students");

    const picker = page.locator("#report-term");
    await expect(picker).toBeVisible({ timeout: 20_000 });
    await picker.click();
    await page.getByRole("option", { name: /الفصل الدراسي الأول/ }).click();

    // Plain dates, not a term id: a report shared with somebody else must not depend on
    // a calendar that might be edited afterwards, and nothing downstream learned a new
    // concept (§16 q7's whole design).
    await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}/, { timeout: 20_000 });
    await expect(page).toHaveURL(/to=\d{4}-\d{2}-\d{2}/);
    await expect(page).not.toHaveURL(/termId/);

    const from = page.locator("#report-from");
    await expect(from).toHaveValue(/^01\/09\/\d{4}$/);
  });

  test("shows the term the dates already match, without being told", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    const year = new Date().getFullYear();
    await page.goto(`/reports/students?from=${year}-09-01&to=${year + 1}-01-15`);

    // The picker reads the dates rather than remembering a choice, so a URL somebody
    // else built still names the term.
    await expect(page.locator("#report-term")).toContainText(/الفصل الدراسي الأول/, {
      timeout: 20_000,
    });
  });
});
