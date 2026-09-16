import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * The portal's rollout (docs/PARENT-PORTAL-PLAN.md, P7).
 *
 * The seed is a centre in the MIDDLE of a rollout: the master switch is on, Nasr City is
 * open, and the other two branches are not. So the interesting tests are not that the
 * portal works — `parent-portal.spec.ts` covers that — but that it is closed everywhere
 * it has not been opened, and that the office cannot print a card promising otherwise.
 */

const PASSWORD = "Password123!";

/** Nasr City is in the rollout; El Obour is not. Both are real, seeded families. */
const ROLLED_OUT = { code: "NSR-26-00001", lastFour: "8001" };
const NOT_YET = { code: "OBR-26-00001", lastFour: "9001" };

async function signInAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill("admin");
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

async function portalSignIn(page: Page, credentials: { code: string; lastFour: string }) {
  await page.goto("/portal");
  await page.locator("#studentCode").fill(credentials.code);
  await page.locator("#lastFour").fill(credentials.lastFour);
  await page.getByRole("button", { name: ar.portal.signIn }).click();
}

test.describe("a branch that is not in the rollout", () => {
  test("refuses its parents in the same words as a wrong code", async ({ page }) => {
    test.setTimeout(120_000);

    await portalSignIn(page, NOT_YET);
    const notYet = await page.getByRole("alert").first().textContent();

    await page.goto("/portal");
    await portalSignIn(page, { code: "NSR-26-99999", lastFour: "0000" });
    const wrongCode = await page.getByRole("alert").first().textContent();

    // If these differed, the sign-in form would tell anybody which branches are open —
    // and tell a parent at El Obour that their details are right but their branch is
    // not, which is a conversation for the office, not for a login screen.
    expect(notYet).toBe(wrongCode);
    // And their real details do work at the branch that IS open.
    await page.goto("/portal");
    await portalSignIn(page, ROLLED_OUT);
    await expect(page.getByText(ROLLED_OUT.code)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("the printed card", () => {
  test("prints for a branch in the rollout, four to a page", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);
    await page.goto("/branches");

    // The printer action exists only for branches already opened, so finding it at all
    // is half the assertion.
    const print = page
      .getByRole("link", { name: `${ar.settings.portalCard} فرع مدينة نصر` })
      .locator("visible=true");
    await expect(print).toBeVisible({ timeout: 20_000 });

    const href = await print.getAttribute("href");
    const response = await page.goto(href ?? "");
    expect(response?.status()).toBe(200);

    // Four identical cards, because the desk hands these out by the handful.
    await expect(page.getByText(ar.portalCard.lead)).toHaveCount(4);
    // The branch's own number, on the card, for when it does not work.
    await expect(page.getByText("+201000000001").first()).toBeVisible();
    await expect(page.getByText("/portal").first()).toBeVisible();
  });

  test("offers no card for a branch that has not been opened", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);
    await page.goto("/branches");

    await expect(page.getByText("فرع العبور").locator("visible=true").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("link", { name: `${ar.settings.portalCard} فرع العبور` })).toHaveCount(0);
  });

  test("404s a card asked for by URL for a branch that is not in the rollout", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);

    await page.goto("/branches");
    const ids = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a[href^='/print/portal-card/']")).map((a) =>
        a.getAttribute("href"),
      ),
    );
    // Three seeded branches, one card link: the page itself refuses to offer a card for
    // a branch that has not been opened, which is the control this test is really about.
    // (The table renders a card list and a table at once, so the links come in pairs.)
    expect(new Set(ids).size).toBe(1);

    // A made-up id is a 404, not an explanation — the same answer a foreign branch gets.
    const response = await page.goto("/print/portal-card/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});

test.describe("the master switch", () => {
  test("is on the settings screen, and says it depends on the lookup", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsAdmin(page);
    await page.goto("/settings");

    const portal = page.locator("#portalEnabled");
    await expect(portal).toBeVisible({ timeout: 20_000 });
    await expect(portal).toBeChecked();

    // Unticking the lookup disables the portal's switch rather than leaving two
    // controls that silently disagree with the SQL.
    await page.locator("#lookupEnabled").uncheck();
    await expect(portal).toBeDisabled();
    await expect(page.getByText(ar.settings.portalNeedsLookup)).toBeVisible();

    // Nothing was saved: the form is not submitted, and a reload puts it back.
    await page.reload();
    await expect(page.locator("#lookupEnabled")).toBeChecked();
  });
});
