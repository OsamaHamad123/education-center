import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * Contacting parents (docs/MESSAGING-AND-FEES-PLAN.md, P4a and P4b).
 *
 * Two claims are worth testing end to end, and neither is "a link exists":
 *
 *   1. the WhatsApp link is PRE-FILLED with the centre's own wording, rendered from the
 *      template in settings — so changing the template changes what goes out;
 *   2. pressing it leaves a record, which is the half of P4a that stops the same family
 *      being rung twice in a morning.
 */

const PASSWORD = "Password123!";

/**
 * The seed marks attendance up to YESTERDAY, so that is the day with something to ring
 * about. Asking for it also exercises the date control, which exists because half the
 * time the office rings the next morning about the day before.
 */
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the template editor", () => {
  test("previews the message as it is typed", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/settings");

    const field = page.locator("#templateDailyAbsence");
    await expect(field).toBeVisible({ timeout: 20_000 });

    await field.fill("اختبار {الطالب} في {الحصص}");
    // The preview is the point: a misspelled placeholder survives rendering on purpose,
    // so this is the only cheap place to catch one.
    const preview = page.locator("#templateDailyAbsence-preview");
    await expect(preview).toContainText("اختبار محمد أحمد في");

    await field.fill("اختبار {النسبه}");
    // A misspelling stays visible rather than vanishing into an empty gap.
    await expect(preview).toContainText("{النسبه}");
  });
});

test.describe("today's list, grouped by family", () => {
  test("opens, and pre-fills WhatsApp from the centre's template", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto(`/attendance/contact?date=${YESTERDAY}`);

    await expect(page.getByRole("heading", { name: ar.contact.title })).toBeVisible({
      timeout: 20_000,
    });

    const links = page.getByRole("link", { name: ar.reports.whatsapp });
    await expect(links.first()).toBeVisible({ timeout: 20_000 });

    const href = await links.first().getAttribute("href");
    expect(href).toContain("https://wa.me/");
    // Pre-filled, not empty: this is the whole of P4a.
    expect(href).toContain("?text=");
    // And the text is the centre's, not a hard-coded English string.
    expect(decodeURIComponent(href ?? "")).toContain("السلام عليكم");
  });

  test("records the contact, and says so on the next load", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto(`/attendance/contact?date=${YESTERDAY}`);

    const first = page.locator('a[href^="https://wa.me/"]').first();
    await expect(first).toBeVisible({ timeout: 20_000 });

    // Strip the href before clicking: the click is what records the contact, and wa.me is
    // somebody else's site this suite has no business opening. Held as an element rather
    // than found again by role, because an anchor without an href stops BEING a link and
    // a role-based locator would quietly resolve to the next family's button.
    await first.evaluate((element) => element.removeAttribute("href"));
    await first.click();

    // The action is fired alongside the navigation and not awaited (see ContactButton),
    // so ask again until it lands rather than assuming it already has.
    await expect
      .poll(
        async () => {
          await page.goto(`/attendance/contact?date=${YESTERDAY}`);
          return page.getByText(ar.contact.lastContacted).count();
        },
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
  });
});

test.describe("the absence alerts screen", () => {
  test("carries the low-attendance template and the contact history", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    // A threshold of 1% so the screen has rows whatever the seed happened to generate.
    await page.goto("/reports/alerts?threshold=1");

    const links = page.getByRole("link", { name: ar.reports.whatsapp });
    await expect(links.first()).toBeVisible({ timeout: 20_000 });

    const href = await links.first().getAttribute("href");
    expect(decodeURIComponent(href ?? "")).toContain("نسبة غياب");
    // Every row says whether this parent has been contacted before, even when the answer
    // is "never" — an absent line would read as "no data" rather than "nobody has rung".
    await expect(page.getByText(ar.contact.neverContacted).first()).toBeVisible();
  });
});
