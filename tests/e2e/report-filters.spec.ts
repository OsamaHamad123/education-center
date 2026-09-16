import { expect, test, type Page } from "@playwright/test";

/**
 * Audit phase B — reports and payroll (docs/AUDIT-2026-09.md, findings 1 and 2).
 *
 * Every URL here answered 500 before: a date or an id went from the query string into
 * a `date` or `uuid` comparison, Postgres refused the cast, and the throw escaped the
 * page. They are asserted by STATUS, because the bug was a status — the page's content
 * was never the problem.
 *
 * A URL is not a submitted form. These are the shapes a real one arrives in: a stale
 * link somebody shared, a hand-edited address bar, a day that does not exist.
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

/** The first of the month to today — what a screen falls back to. */
async function expectDefaultRange(page: Page) {
  await expect(page.locator("#report-from")).toHaveValue(/^01\/\d{2}\/\d{4}$/);
  await expect(page.locator("#report-to")).toHaveValue(/^\d{2}\/\d{2}\/\d{4}$/);
}

const BRANCH_ADMIN_URLS = [
  "/reports/students?from=abc&to=def",
  "/reports/students?from=2026-02-31&to=2026-09-30",
  "/reports/matrix?classId=not-a-uuid",
  "/reports/matrix?from=13&to=..%2F..%2Fetc",
  "/reports/alerts?from=abc&to=def",
  "/payroll?from=abc&to=def",
  "/payroll?teacherId=not-a-uuid",
  "/print/payroll?from=abc&to=def",
  "/print/reports/students?from=abc&to=def",
];

test.describe("a nonsense range or id in the URL", () => {
  test("renders the page for a branch admin instead of a 500", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    for (const url of BRANCH_ADMIN_URLS) {
      const response = await page.goto(url);
      expect(response?.status(), `${url} should render`).toBe(200);
    }
  });

  test("renders the cross-branch pages for a super admin too", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");

    for (const url of ["/reports/branches?from=x&to=y", "/payroll?branchId=not-a-uuid"]) {
      const response = await page.goto(url);
      expect(response?.status(), `${url} should render`).toBe(200);
    }
  });

  test("falls back to this month, rather than echoing the junk back", async ({ page }) => {
    await signIn(page, "admin_nsr");

    await page.goto("/reports/students?from=abc&to=def");
    await expectDefaultRange(page);

    // A day with the right shape and no existence: 2026 is not a leap year and
    // February has no 31st either way. The regex would have let both through.
    await page.goto("/reports/students?from=2026-02-31&to=2026-13-01");
    await expectDefaultRange(page);
  });

  test("keeps the half of the range that is real", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // `?to=` on its own has always been a legitimate request, so a broken `from` must
    // fall back WITHOUT taking the good half with it.
    await page.goto("/reports/students?from=abc&to=2026-09-10");
    await expect(page.locator("#report-from")).toHaveValue(/^01\/\d{2}\/\d{4}$/);
    await expect(page.locator("#report-to")).toHaveValue("10/09/2026");
  });

  test("still reports on a range that was meant", async ({ page }) => {
    await signIn(page, "admin_nsr");

    await page.goto("/reports/students?from=2026-09-01&to=2026-09-30");
    await expect(page.locator("#report-from")).toHaveValue("01/09/2026");
    await expect(page.locator("#report-to")).toHaveValue("30/09/2026");
  });

  test("does not turn a 404 into a 200: an id that is not theirs still vanishes", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // Validating the SHAPE of an id must not be mistaken for checking whose it is.
    // That answer is RLS's, and it is still 404.
    const response = await page.goto("/payroll/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});
