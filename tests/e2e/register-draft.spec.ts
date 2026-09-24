import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * A register that survives a reload (docs/ROADMAP.md, item 1).
 *
 * The product's most-used screen, on the worst network it will ever meet. A failed save
 * already kept the screen intact; a RELOAD did not, and thirty taps went with it.
 *
 * Giza, desktop only: the suite marks registers in Nasr City from two projects at once,
 * and a draft banner is state on the device rather than in the database.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

async function openFirstRegister(page: Page) {
  await page.goto("/attendance");
  const period = page.getByRole("link", { name: /^فتح الحصة \d+ — / }).first();
  if ((await period.count()) === 0) return false;
  await period.click();
  await expect(page.getByRole("button", { name: ar.attendance.markAllPresent })).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

test.describe("unsaved marks on a bad connection", () => {
  /*
   * SERIAL, and it has to be.
   *
   * `fullyParallel` runs these two across two workers, and both open the SAME first
   * Giza register and tap the SAME first "حاضر" button — the first student on it. One
   * test then SAVES that student absent, and the other's draft, which says exactly the
   * same thing, stops differing from the server: `offerDraft` requires the draft to
   * disagree with what was committed, so the banner never appears and the test fails
   * on a race between two tests rather than on anything the product did.
   *
   * Run in order, each starts from a settled register and taps a different student.
   */
  test.describe.configure({ mode: "serial" });

  test("survive a reload, and are offered back rather than applied behind your back", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser: the draft lives on the device");
    test.setTimeout(150_000);
    await signIn(page, "admin_giz");
    if (!(await openFirstRegister(page))) test.skip(true, "no register to mark in Giza today");

    // Save first, so the server's answer is known and the draft is measured against it.
    await page.getByRole("button", { name: new RegExp(`^${ar.attendance.save}`) }).click();
    await expect(page.getByText(ar.attendance.saved).first()).toBeVisible({ timeout: 20_000 });

    // Mark somebody absent and DO NOT save — the phone dies, the tab is closed, the
    // browser is reloaded. Whatever happened, the taps are not on the server.
    const present = page.getByRole("button", { name: /: حاضر$/ }).first();
    const name = (await present.getAttribute("aria-label"))?.replace(/: حاضر$/, "") ?? "";
    // One tap: present → absent. Absent is deliberately first in the cycle.
    await present.click();
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: ar.attendance.markAllPresent })).toBeVisible({
      timeout: 20_000,
    });

    // Offered, not applied: silently restoring would mean a register that disagrees
    // with the server without anybody having chosen that.
    await expect(page.getByText(ar.attendance.draftFound)).toBeVisible();
    await page.getByRole("button", { name: ar.attendance.draftRestore }).click();
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    // Saving clears the draft, so the banner does not follow the register around after
    // the work it was protecting has landed.
    await page.getByRole("button", { name: new RegExp(`^${ar.attendance.save}`) }).click();
    await expect(page.getByText(ar.attendance.saved).first()).toBeVisible({ timeout: 20_000 });
    await page.reload();
    await expect(page.getByRole("button", { name: ar.attendance.markAllPresent })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(ar.attendance.draftFound)).toHaveCount(0);
  });

  test("can be thrown away, and stay thrown away", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser: the draft lives on the device");
    test.setTimeout(150_000);
    await signIn(page, "admin_giz");
    if (!(await openFirstRegister(page))) test.skip(true, "no register to mark in Giza today");

    const present = page.getByRole("button", { name: /: حاضر$/ }).first();
    const name = (await present.getAttribute("aria-label"))?.replace(/: حاضر$/, "") ?? "";
    await present.click();
    // Wait for the tap to land before reloading. The draft is written by an effect, and
    // a reload fired in the same tick can beat it — a race in the TEST rather than in
    // the feature, which is why this assertion is here instead of implied.
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    await page.reload();
    await expect(page.getByText(ar.attendance.draftFound)).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: ar.attendance.draftDiscard }).click();
    await expect(page.getByText(ar.attendance.draftFound)).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("button", { name: ar.attendance.markAllPresent })).toBeVisible({
      timeout: 20_000,
    });
    // Discarded means gone: a banner that comes back is a banner people learn to ignore.
    await expect(page.getByText(ar.attendance.draftFound)).toHaveCount(0);
  });
});
