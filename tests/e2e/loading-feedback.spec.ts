import { expect, test, type Page } from "@playwright/test";

/**
 * UX audit phase B — knowing the app is working (docs/UX-AUDIT-2026-09.md, findings 2
 * and 3).
 *
 * Both findings are about the same silence, and they are fixed by two different things,
 * which is why they are tested together:
 *
 *   - arriving at a page shows `loading.tsx`;
 *   - changing a filter on a page you are already on keeps that page and disables the
 *     controls, because replacing it with a skeleton would be a worse answer.
 *
 * The server is slowed with a route delay, because on a local machine every response is
 * instant and there is nothing to see.
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

/** Holds up the document and RSC requests for one path, so the in-between is visible. */
async function slowDown(page: Page, match: string, ms = 2500) {
  await page.route(match, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

test.describe("arriving at a page", () => {
  test("spins on the link that was tapped, and stops when the page arrives", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    // On a phone the nav lives behind the hamburger, and the sheet used to close on tap
    // — so the feedback had nowhere to appear. It now stays until the route changes.
    const menu = page.getByRole("button", { name: "القائمة" });
    if (await menu.isVisible()) await menu.click();

    await slowDown(page, "**/students**");
    const link = page.getByRole("link", { name: "الطلاب" }).locator("visible=true").first();
    await link.click();

    // The feedback is ON the link, not a page skeleton. A route-group `loading.tsx` was
    // the obvious answer and was reverted: it flushes the shell before the page decides,
    // so `notFound()` arrives inside a 200. See the comment on `NavSpinner`.
    await expect(link.locator("svg.animate-spin")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByRole("heading", { name: "الطلاب" })).toBeVisible({ timeout: 20_000 });
    await expect(link.locator("svg.animate-spin")).toHaveCount(0);
  });

  test("still answers 404 for a page the viewer may not see", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // The reason the skeleton was reverted, asserted so it cannot come back by accident.
    const response = await page.goto("/students/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});

test.describe("changing a filter on a page you are already on", () => {
  test("keeps the page and disables the controls while it reloads", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/reports/students");
    await expect(page.locator("#report-from")).toBeVisible();

    await slowDown(page, "**/reports/students**");
    await page.locator("#report-to").fill("20/09/2026");

    // The controls are a disabled group, so nothing can be tapped twice…
    await expect(page.locator("#report-from")).toBeDisabled({ timeout: 10_000 });
    // …and the page they belong to is still on screen, not swapped for a skeleton.
    await expect(page.getByRole("heading", { name: "حضور الطلاب" })).toBeVisible();

    await expect(page.locator("#report-from")).toBeEnabled({ timeout: 20_000 });
    await expect(page.locator("#report-to")).toHaveValue("20/09/2026");
  });

  test("stops the attendance date stepper being tapped twice", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/attendance");
    await expect(page).toHaveURL(/classId=/, { timeout: 20_000 });

    const back = page.getByRole("button", { name: "اليوم السابق" }).locator("visible=true").first();
    await slowDown(page, "**/attendance**");
    await back.click();

    // This is the control the audit was about: it used to look like it had done
    // nothing, so it got tapped again and the board jumped two days.
    await expect(back).toBeDisabled({ timeout: 10_000 });
    await expect(back).toBeEnabled({ timeout: 20_000 });
  });
});
