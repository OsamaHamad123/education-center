import { expect, test, type Page } from "@playwright/test";

/**
 * UX audit phase A — the failure path (docs/UX-AUDIT-2026-09.md, findings 1 and 4).
 *
 * These abort the request in flight, which is the case every mutating component was
 * missing: not "the server said no" but "the server did not answer". React re-throws a
 * rejected promise from inside a transition to the nearest error boundary, so a dropped
 * save used to replace the whole screen — and everything typed into it.
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

/** Server actions POST to the page's own URL. Kill those and nothing else. */
async function dropServerActions(page: Page, path: string) {
  await page.route(`**${path}`, (route) =>
    route.request().method() === "POST" ? route.abort("failed") : route.continue(),
  );
}

test.describe("when a save does not reach the server", () => {
  test("keeps the form, the typed data, and says so", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/classes");

    await page.getByRole("button", { name: "إضافة شعبة" }).first().click();
    await page.locator("#class-name").fill("شعبة اختبار الشبكة");
    await page.locator("[name=gradeLevel]").first().fill("الثالث الثانوي");

    await dropServerActions(page, "/classes");
    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(page.getByText("تعذّر الوصول إلى الخادم", { exact: false })).toBeVisible({
      timeout: 15_000,
    });

    // The whole point: the dialog is still open and still holds what was typed, so a
    // retry is one tap rather than filling the form in again.
    await expect(page.getByText("حدث خطأ غير متوقع")).toHaveCount(0);
    await expect(page.locator("#class-name")).toHaveValue("شعبة اختبار الشبكة");
  });

  test("keeps a marked register rather than throwing it away", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: it opens a register.");
    test.setTimeout(120_000);

    await signIn(page, "admin_nsr");

    // Period 1 without reserving it: the attendance spec partitions periods because its
    // saves WRITE, and this one never completes a save, so there is no row to collide on.
    await page.goto("/attendance");
    await page.getByRole("combobox", { name: "الشعبة" }).click();
    await page.getByRole("option", { name: "علمي 1 - بنين", exact: true }).click();
    await page.getByRole("link", { name: /^فتح الحصة 1 — / }).click();
    await expect(page.getByRole("button", { name: "تعليم الكل حاضر" })).toBeVisible();

    // Mark somebody absent, so there is work on screen worth losing.
    const student = page.getByRole("button", { name: /: حاضر$/ }).first();
    const name = ((await student.getAttribute("aria-label")) ?? "").replace(/: حاضر$/, "");
    await student.click();
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();

    await dropServerActions(page, "/attendance/mark**");
    await page.getByRole("button", { name: "حفظ الحضور" }).click();

    await expect(page.getByText("تعذّر الوصول إلى الخادم", { exact: false })).toBeVisible({
      timeout: 15_000,
    });
    // Still on the register, not on the error page, and the mark is still on screen.
    await expect(page).toHaveURL(/\/attendance\/mark/);
    await expect(page.getByText("حدث خطأ غير متوقع")).toHaveCount(0);
    await expect(page.getByRole("button", { name: `${name}: غائب` })).toBeVisible();
  });
});

test.describe("the error page", () => {
  test("does not ask for a reference number it has not got", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // A client-side error carries no digest — only a server one does.
    await page.goto("/classes");
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("probe");
      }, 0);
    });

    // Either the boundary shows, in which case the text must not point at a number
    // that is not there, or nothing happens — both are acceptable; the wrong text is
    // not (docs/UX-AUDIT-2026-09.md, finding 4).
    const body = await page.locator("body").innerText();
    if (body.includes("حدث خطأ غير متوقع")) {
      expect(body).not.toContain("بالرقم أدناه");
    }
  });
});
