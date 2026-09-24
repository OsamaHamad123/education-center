import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * The two screens the centre asked for on 2026-09-24: who was absent WITHOUT
 * permission, and paying every teacher in one press.
 *
 * The absence tests are reads and safe anywhere. The payout test is not — it writes a
 * settlement row and settling a month FREEZES that month's registers for those
 * teachers, which would break `attendance.spec.ts` marking Nasr City at the same
 * moment. So it runs in GIZA, on the desktop project only, and reverses everything it
 * settles before it finishes. Same reasoning as `payroll-runs.spec.ts`.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("absence without permission", () => {
  test("lists a student and the periods they missed", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/attendance/absences?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.absences.title);
    // The period is named, not just the day — that is the request in one assertion.
    await expect(page.getByText(ar.absences.period, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("says plainly that excused absence is not here", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/attendance/absences?from=2000-01-01&to=2100-01-01");

    await expect(page.getByText(ar.absences.excusedNote).first()).toBeVisible({ timeout: 20_000 });
  });

  test("shows today's on the branch dashboard", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    await expect(page.getByText(ar.absences.today).first()).toBeVisible({ timeout: 20_000 });
  });

  test("a malformed range falls back rather than erroring", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const response = await page.goto("/attendance/absences?from=13&to=..%2F..%2Fetc");
    expect(response?.status()).toBeLessThan(400);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.absences.title);
  });
});

test.describe("a teacher", () => {
  test("sees their own students' absences and no class filter", async ({ page }) => {
    test.setTimeout(120_000);
    // A teacher signs in with their phone and access code, on the other tab.
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill("01011110001");
    await page.getByLabel("كود الدخول").fill("123456");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });

    await page.goto("/teacher/absences?from=2000-01-01&to=2100-01-01");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.absences.title);
    await expect(page.getByText(ar.absences.teacherDescription).first()).toBeVisible();

    // A teacher holds no `student.read`, so a name here must not be a link into the
    // profile they would 404 on.
    await expect(page.locator('a[href^="/students/"]')).toHaveCount(0);
  });
});

test.describe("paying every teacher at once", () => {
  test.describe.configure({ mode: "serial" });

  test("names the count, warns about the freeze, then pays and reverses", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser only — it writes payroll rows");
    test.setTimeout(180_000);

    // EL OBOUR, not Giza. `payroll-runs.spec.ts` settles Giza in its own desktop test
    // and the suite runs two workers against one database — two tests settling and
    // reversing the same branch's month would fight over each other's rows and fail
    // for a reason that has nothing to do with the product. Nasr City is where
    // `attendance.spec.ts` marks registers, and a settled month freezes those.
    await signIn(page, "admin_obr");
    await page.goto("/payroll/runs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.payroll.runs, { timeout: 20_000 });

    // "صرف للكل (7)" — the count is on the button, because this is the one control in
    // the product that moves several people's money at once.
    //
    // Character classes rather than backslash escapes, and `new RegExp(string)` rather
    // than a template literal. The first version of this was written as a template
    // literal, where `\(` is just `(` and `\d` is just `d` — so it compiled to
    // /^صرف للكل (d+)$/, matched nothing, SKIPPED itself, and was counted as a pass.
    //
    // And asserted rather than skipped-if-absent, for the same reason: El Obour has
    // sixty seeded lessons this month, so if this button is not here something is
    // wrong and the suite should say so instead of going quiet.
    const trigger = page.getByRole("button", {
      name: new RegExp("^" + ar.payroll.settleAll + " [(][0-9]+[)]$"),
    });
    await expect(trigger).toBeVisible({ timeout: 20_000 });
    await trigger.click();

    // The freeze is stated in the dialog that ASKS, the only place it can still change
    // somebody's mind.
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(ar.payroll.settleAllDescription)).toBeVisible();
    await dialog.getByRole("button", { name: ar.payroll.settleAll, exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    // Paid rows appear — and each is reversible ON ITS OWN, which is the reason the
    // run writes a row per teacher rather than one for the branch.
    await expect(page.getByText(ar.payroll.settledBadge).first()).toBeVisible({ timeout: 30_000 });

    // Put the month back exactly as it was: a settled month in this shared database
    // freezes registers other suites are writing.
    for (let i = 0; i < 20; i++) {
      const reverse = page.getByRole("button", { name: ar.payroll.reverseRun }).first();
      if ((await reverse.count()) === 0) break;
      await reverse.click();
      const confirm = page.getByRole("dialog");
      await confirm.locator("input[id^='reverse-run-']").fill("اختبار");
      await confirm.getByRole("button", { name: ar.payroll.reverseRun }).click();
      await expect(confirm).toBeHidden({ timeout: 20_000 });
    }
    await expect(page.getByRole("button", { name: ar.payroll.reverseRun })).toHaveCount(0);
  });
});
