import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * Paying the teachers (`drizzle/0016`; docs/PRODUCT-REVIEW-2026-09.md, finding 2).
 *
 * One test matters more than the others: settling a month must actually FREEZE that
 * month's registers for that teacher. Everything else here is a screen; that is a rule,
 * and a rule that only holds inside a use case is a rule nobody has checked.
 *
 * That test runs in GIZA and on the desktop project only, and it reverses what it
 * settled before it finishes. The suite shares one database, and a settled month in
 * Nasr City would freeze the registers `attendance.spec.ts` is marking at the same
 * moment — which would be a true failure about a test, not about the product.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the settlement screen", () => {
  test("lists this month's teachers with what is computed and what is paid", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/payroll/runs");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.payroll.runs);
    await expect(page.getByText(ar.payroll.computedAmount).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ar.payroll.paidAmount).first()).toBeVisible();
  });

  test("warns about the freeze BEFORE the button, not after", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/payroll/runs");

    // The trigger is labelled "صرف <teacher>"; the dialog's own button is just "صرف".
    const settle = page.getByRole("button", { name: new RegExp(`^${ar.payroll.settle} .`) }).first();
    await expect(settle).toBeVisible({ timeout: 20_000 });
    await settle.click();

    // The surprising consequence is stated in the dialog that ASKS, which is the only
    // place it can still change somebody's mind.
    await expect(page.getByText(ar.payroll.settleDescription)).toBeVisible();
  });

  test("gives a teacher no way in at all", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill("01011110001");
    await page.getByLabel("كود الدخول").fill("123456");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });

    // Reading your own payslip and writing it are not the same permission. The admin
    // shell turns a teacher away at the door, so this lands back on their own portal
    // rather than on a 404 — which is the better answer, and the one to assert.
    await page.goto("/payroll/runs");
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
    await expect(page.getByText(ar.payroll.runsDescription)).toHaveCount(0);
  });
});

test.describe("settling a month", () => {
  test("records it, and FREEZES that teacher's register", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser only: it settles a real month");
    test.setTimeout(180_000);
    await signIn(page, "admin_giz");

    // A register that can be marked today, saved once to prove it is open.
    await page.goto("/attendance");
    const period = page.getByRole("link", { name: /^فتح الحصة \d+ — / }).first();
    if ((await period.count()) === 0) test.skip(true, "no register to mark in Giza today");
    await period.click();
    await expect(page.getByRole("button", { name: ar.attendance.markAllPresent })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: new RegExp(`^${ar.attendance.save}`) }).click();
    await expect(page.getByText(ar.attendance.saved).first()).toBeVisible({ timeout: 20_000 });

    // Settle every teacher of this branch for this month.
    await page.goto("/payroll/runs");
    for (let i = 0; i < 20; i++) {
      // Trigger vs confirm: the trigger is labelled "صرف <teacher>" and the dialog's
      // button is exactly "صرف". Matching both with one locator picks up a closing
      // dialog's disabled button and waits for ever.
      const settle = page.getByRole("button", { name: new RegExp(`^${ar.payroll.settle} .`) }).first();
      if ((await settle.count()) === 0) break;
      await settle.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: ar.payroll.settle, exact: true }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });
    }
    await expect(page.getByText(ar.payroll.settledBadge).first()).toBeVisible({ timeout: 20_000 });

    // The same register now refuses. This is the rule the whole table exists for: the
    // money is out the door, so the month stops being quietly rewritable.
    await page.goto("/attendance");
    await page
      .getByRole("link", { name: /^فتح الحصة \d+ — / })
      .first()
      .click();
    await page.getByRole("button", { name: new RegExp(`^${ar.attendance.save}`) }).click();
    await expect(page.getByText(ar.payroll.periodSettled).first()).toBeVisible({ timeout: 20_000 });

    // And the month opens again once the settlement is reversed — otherwise a payout
    // recorded by mistake would lock a register for ever.
    await page.goto("/payroll/runs");
    for (let i = 0; i < 20; i++) {
      const reverse = page.getByRole("button", { name: ar.payroll.reverseRun }).first();
      if ((await reverse.count()) === 0) break;
      await reverse.click();
      const dialog = page.getByRole("dialog");
      await dialog.locator("input[id^='reverse-run-']").fill("اختبار");
      await dialog.getByRole("button", { name: ar.payroll.reverseRun }).click();
      await expect(dialog).toBeHidden({ timeout: 20_000 });
    }

    await page.goto("/attendance");
    await page
      .getByRole("link", { name: /^فتح الحصة \d+ — / })
      .first()
      .click();
    await page.getByRole("button", { name: new RegExp(`^${ar.attendance.save}`) }).click();
    await expect(page.getByText(ar.attendance.saved).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("the teacher's own screen", () => {
  test("answers 'has this month been paid' without them having to ask", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill("01011110001");
    await page.getByLabel("كود الدخول").fill("123456");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });

    await page.goto("/teacher/earnings");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.payroll.myEarnings, {
      timeout: 20_000,
    });
    // Whether a payout is listed depends on what the centre has settled; what must
    // always hold is that the teacher's own screen renders it without erroring.
    await expect(page.getByText(ar.payroll.descriptionTeacher)).toBeVisible();
  });
});
