import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 9 — the public lookup (PROJECT_PLAN 10.8), tested as a security feature.
 *
 * Every test here runs with NO session: the browser context is cleared first, so what
 * is exercised is exactly what a stranger with the URL can reach.
 */

const CODE = "NSR-26-00001";
const LAST_FOUR = "8001";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

async function openLookup(page: Page) {
  await page.context().clearCookies();
  await page.goto("/lookup");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

async function submit(page: Page, code: string, lastFour: string) {
  await page.getByLabel("كود الطالب").fill(code);
  await page.getByLabel("آخر 4 أرقام من هاتف ولي الأمر").fill(lastFour);
  await page.getByRole("button", { name: "استعلام" }).click();
}

test.describe("reaching the page", () => {
  test("is public — no session, no redirect to login", async ({ page }) => {
    await openLookup(page);

    expect(page.url()).toContain("/lookup");
    await expect(page.getByLabel("كود الطالب")).toBeVisible();
  });

  test("tells search engines to stay away", async ({ page }) => {
    await openLookup(page);

    // This is the only page a crawler can reach; a cached copy of a child's record
    // in a search index is not something a `noindex` added later would undo.
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });
});

test.describe("a parent with the right details", () => {
  test("sees the first name and a family INITIAL, never the full name", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, LAST_FOUR);

    await expect(visible(page, "محمد ا.").first()).toBeVisible();
    // The seeded student is محمد شعبان شعبان الفقي; only the first name survives.
    await expect(page.getByText("الفقي")).toHaveCount(0);
  });

  test("sees the branch, the class, a percentage and the weekly timetable", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, LAST_FOUR);

    await expect(visible(page, /فرع مدينة نصر/).first()).toBeVisible();
    await expect(visible(page, "الجدول الأسبوعي").first()).toBeVisible();
    await expect(visible(page, /^\d{1,3}%$/).first()).toBeVisible();
  });

  test("is shown NO phone number and no student code", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, LAST_FOUR);
    await expect(visible(page, "محمد ا.").first()).toBeVisible();

    const body = (await page.locator("body").textContent()) ?? "";
    expect(body).not.toContain("8001");
    expect(body).not.toContain("+201");
    expect(body).not.toContain(CODE);
  });

  test("leaves the code out of the URL entirely", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, LAST_FOUR);
    await expect(visible(page, "محمد ا.").first()).toBeVisible();

    // A shareable link would live on in history, referrers and proxy logs.
    expect(page.url()).not.toContain(CODE);
    expect(page.url()).not.toContain("8001");
    expect(new URL(page.url()).search).toBe("");
  });

  test("can be reset without reloading, and the result does not survive a reload", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, LAST_FOUR);
    await expect(visible(page, "محمد ا.").first()).toBeVisible();

    await page.getByRole("button", { name: "استعلام آخر" }).click();
    await expect(page.getByLabel("كود الطالب")).toBeVisible();

    await page.reload();
    await expect(page.getByText("محمد ا.")).toHaveCount(0);
  });

  test("accepts Arabic-Indic digits, which an Arabic keyboard types by default", async ({ page }) => {
    await openLookup(page);
    await submit(page, "NSR-٢٦-٠٠٠٠١", "٨٠٠١");

    await expect(visible(page, "محمد ا.").first()).toBeVisible();
  });
});

test.describe("enumeration", () => {
  test("answers an unknown code and wrong digits with the SAME message", async ({ page }) => {
    await openLookup(page);
    await submit(page, "NSR-26-99999", LAST_FOUR);
    const unknownCode = await visible(page, /لا توجد بيانات مطابقة/)
      .first()
      .textContent();

    await page.reload();
    await submit(page, CODE, "9999");
    const wrongDigits = await visible(page, /لا توجد بيانات مطابقة/)
      .first()
      .textContent();

    // Identical text, so nothing tells an attacker which codes exist.
    expect(unknownCode).toBe(wrongDigits);
    expect(unknownCode).toBeTruthy();
  });

  test("rejects a malformed code before it reaches the database", async ({ page }) => {
    await openLookup(page);
    await submit(page, "not-a-code", LAST_FOUR);

    // A shape complaint is about what was typed, not about who exists — and a
    // request that never runs cannot be timed or counted.
    await expect(visible(page, /صيغة كود الطالب غير صحيحة/).first()).toBeVisible();
  });

  test("rejects anything but four digits", async ({ page }) => {
    await openLookup(page);
    await submit(page, CODE, "80");

    await expect(visible(page, /4 أرقام بالضبط/).first()).toBeVisible();
  });
});

/**
 * The rate limiter is NOT exercised here. The whole suite runs from one address, so a
 * per-IP budget meant for the internet would block these tests against each other
 * after five deliberately-wrong lookups — which is why Playwright sets
 * `DISABLE_RATE_LIMIT=1`, exactly as it already does for sign-in.
 *
 * It is covered instead by:
 *   * unit tests on `checkLookupLimits` (the decision, including the distributed
 *     attack a per-IP limit alone would miss), and
 *   * an integration test on `app_lookup_failures` (the counters it reads, and their
 *     two separate windows).
 *
 * The wiring between them was verified by hand against a server started WITHOUT the
 * flag — see docs/PROGRESS.md.
 */
