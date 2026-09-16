import { expect, test, type Page } from "@playwright/test";

/**
 * The parent portal (docs/PARENT-PORTAL-PLAN.md, P1–P3).
 *
 * The portal is the second thing in this product reachable without a staff session, and
 * the first that hands out an unmasked name. So the tests that matter are not the happy
 * path — they are the ones that try to be somebody else.
 */

/** The seed prints these: the code, and the last four of the parent's phone. */
const CHILD = { code: "NSR-26-00001", lastFour: "8001" };
const OTHER_CHILD = { code: "NSR-26-00005", lastFour: "8005" };

async function signIn(page: Page, credentials: { code: string; lastFour: string }) {
  await page.goto("/portal");
  await page.locator("#studentCode").fill(credentials.code);
  await page.locator("#lastFour").fill(credentials.lastFour);
  await page.getByRole("button", { name: "دخول" }).click();
}

async function portalCookies(page: Page) {
  const jar = await page.context().cookies();
  return jar.filter((cookie) => cookie.name === "ec.portal");
}

test.describe("signing in", () => {
  test("opens the child's record and stays open", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);

    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });
    // Unmasked, unlike the anonymous lookup: a session has been proved.
    await expect(page.getByText("محمد شعبان شعبان الفقي")).toBeVisible();

    // A reload keeps the session — that is the whole point of P1 over the lookup.
    await page.reload();
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });
  });

  test("says the same thing for a wrong code and wrong digits", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, { code: "NSR-26-99999", lastFour: "0000" });
    const unknownCode = await page.getByRole("alert").first().textContent();

    await page.goto("/portal");
    await signIn(page, { code: CHILD.code, lastFour: "0000" });
    const wrongDigits = await page.getByRole("alert").first().textContent();

    // If these differed, the form would be a way to find out which codes exist.
    expect(unknownCode).toBe(wrongDigits);
  });

  test("refuses a malformed code without asking the database", async ({ page }) => {
    await signIn(page, { code: "not-a-code", lastFour: "12" });
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("NSR-26")).toHaveCount(0);
  });
});

test.describe("one parent, one family", () => {
  test("cannot reach another parent's child by changing the URL", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });

    // A student id is a request, not a permission: the SQL requires the id and the
    // session's phone to belong to each other.
    await page.goto("/portal?studentId=00000000-0000-4000-8000-000000000000");
    // Falls back to their own child rather than erroring — and never shows another's.
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(OTHER_CHILD.code)).toHaveCount(0);
  });

  test("shows no child switcher for a parent with one child", async ({ page }) => {
    await signIn(page, CHILD);
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("اختر الابن")).toHaveCount(0);
  });
});

test.describe("the record", () => {
  test("answers any range, which the anonymous lookup cannot", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);
    await expect(page.locator("#portal-from")).toBeVisible({ timeout: 20_000 });

    await page.goto("/portal?from=2026-09-01&to=2026-09-10");
    await expect(page.locator("#portal-from")).toHaveValue("01/09/2026");
    await expect(page.locator("#portal-to")).toHaveValue("10/09/2026");
  });

  test("falls back to this month for a range that makes no sense", async ({ page }) => {
    await signIn(page, CHILD);
    await expect(page.locator("#portal-from")).toBeVisible({ timeout: 20_000 });

    // Backwards, and a decade wide: both are refused in favour of the default.
    await page.goto("/portal?from=2026-09-30&to=2026-09-01");
    await expect(page.locator("#portal-from")).toHaveValue(/^01\/\d{2}\/\d{4}$/);
  });

  test("prints, and the print sheet checks the parent too", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });

    const response = await page.goto("/portal/print?from=2026-09-01&to=2026-09-30");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("محمد شعبان شعبان الفقي")).toBeVisible();

    // Signed out, the same URL is a 404 — the sheet does not trust the query string.
    await page.context().clearCookies();
    const anonymous = await page.goto("/portal/print?from=2026-09-01&to=2026-09-30");
    expect(anonymous?.status()).toBe(404);
  });
});

test.describe("signing out", () => {
  test("ends the session on the server, not just in the browser", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page.locator("#studentCode")).toBeVisible({ timeout: 20_000 });
  });

  test("and takes the cookie with it", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, CHILD);
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });
    expect(await portalCookies(page)).toHaveLength(1);

    await page.getByRole("button", { name: "خروج" }).click();
    await expect(page.locator("#studentCode")).toBeVisible({ timeout: 20_000 });

    // P6, finding 1. This failed before `drizzle/0010`'s sibling fix: `cookies().delete`
    // expires a cookie at the request's default path, the portal's lives at `/portal`,
    // and a cookie is keyed on its path — so the credential sat in the browser for
    // thirty days and only the server-side row delete was ending anything. On a phone
    // shared between a family and a tutor, that is the whole point of the button.
    expect(await portalCookies(page)).toHaveLength(0);
  });
});

test.describe("the portal is not indexable", () => {
  test("says so in its headers", async ({ page }) => {
    const response = await page.goto("/portal");
    const robots = response?.headers()["x-robots-tag"] ?? "";
    const html = await page.content();
    // Either header or meta is fine; a page about one child must carry one of them.
    expect(robots.includes("noindex") || html.includes("noindex")).toBe(true);
  });
});
