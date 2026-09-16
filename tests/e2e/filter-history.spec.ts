import { expect, test, type Page } from "@playwright/test";

/**
 * UX audit phase C — the URL as state (docs/UX-AUDIT-2026-09.md, finding 7).
 *
 * A filter is a refinement of the screen you are on, not a place you went to. Every one
 * of them used to `push`, so the back button stopped meaning "leave this screen" and
 * started meaning "undo one date".
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

test.describe("the back button after changing filters", () => {
  test("leaves the attendance board, rather than undoing one day at a time", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    // Arrive from the dashboard, the way a user does. On a phone the nav is behind the
    // hamburger, and this test is about history, so the menu must be opened first.
    const menu = page.getByRole("button", { name: "القائمة" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "الحضور" }).locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/attendance/, { timeout: 20_000 });

    const back = page.getByRole("button", { name: "اليوم السابق" }).locator("visible=true").first();
    const startDate = new URL(page.url()).searchParams.get("date");

    for (let step = 0; step < 3; step++) {
      await expect(back).toBeEnabled({ timeout: 20_000 });
      await back.click();
    }
    await expect(back).toBeEnabled({ timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get("date")).not.toBe(startDate);

    // ONE press of the browser's back button, not three.
    await page.goBack();
    await expect(page).toHaveURL("/", { timeout: 20_000 });
  });

  test("leaves a report after changing its range", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/reports");
    // A link on the page itself, not in the nav, so no menu to open here.
    await page.getByRole("link", { name: "حضور الطلاب" }).locator("visible=true").first().click();
    await expect(page).toHaveURL(/\/reports\/students/, { timeout: 20_000 });

    await page.locator("#report-to").fill("2026-09-20");
    await expect(page.locator("#report-to")).toBeEnabled({ timeout: 20_000 });
    await page.locator("#report-from").fill("2026-09-02");
    await expect(page.locator("#report-from")).toBeEnabled({ timeout: 20_000 });

    await page.goBack();
    await expect(page).toHaveURL(/\/reports$/, { timeout: 20_000 });
  });
});

test.describe("scroll position", () => {
  test("stays where it was when a filter changes", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "The list is scrolled on a desktop viewport.");
    test.setTimeout(120_000);

    await signIn(page, "admin_nsr");
    await page.goto("/students");
    await expect(page.locator("#student-search")).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(0);

    // A search that matches every code in the branch, so the list stays exactly as long
    // and the scroll position has somewhere to be preserved. Filtering to one class
    // would shorten the page, and a page that cannot scroll reports 0 either way.
    await page.locator("#student-search").fill("NSR-26");
    await page.locator("#student-search").press("Enter");
    await expect(page.locator("#student-search")).toBeEnabled({ timeout: 20_000 });
    await expect(page).toHaveURL(/search=/, { timeout: 20_000 });

    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  });
});
