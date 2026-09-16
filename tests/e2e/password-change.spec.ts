import { expect, test, type Page } from "@playwright/test";

/**
 * Audit phase A — sign-in and the account (docs/AUDIT-2026-09.md, findings 3, 4, 5).
 *
 * These assert on what the SERVER does, because that is precisely what was wrong: the
 * forced password change could be cleared by an action that checked nothing, the
 * 8-character floor lived only in the browser, and `?next=//evil.com` passed a
 * `startsWith("/")` test.
 */

const PASSWORD = "Password123!";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

async function signIn(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "دخول" }).click();
}

/**
 * Creates a throwaway admin and returns the credentials the dialog shows once.
 *
 * A fresh account each run, rather than resetting a seeded one: a test that leaves a
 * seeded admin holding a temporary password would break every other spec that signs
 * in as them, and it would do it on the run AFTER the failure.
 */
async function createThrowawayAdmin(page: Page): Promise<{ username: string; password: string }> {
  const username = `audit_${Date.now().toString(36)}`;

  await page.goto("/users");
  await page.getByRole("button", { name: "إضافة مدير فرع" }).click();
  // By id, not by label: the list behind the dialog has a search box whose accessible
  // name is also "الاسم".
  await page.locator("#admin-name").fill("مدير اختبار المراجعة");
  await page.locator("#admin-username").fill(username);
  await page.getByRole("combobox", { name: "الفرع" }).click();
  await page.getByRole("option", { name: "فرع العبور" }).click();
  await page.getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByText("كلمة المرور المؤقتة")).toBeVisible({ timeout: 20_000 });
  const password = (await page.locator("dd.select-all").innerText()).trim();
  expect(password).toHaveLength(12);

  return { username, password };
}

test.describe("the forced password change", () => {
  test("cannot be walked past, and the temporary password stops working once it is", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: it creates an account.");
    test.setTimeout(120_000);

    await signIn(page, "admin", PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });
    const account = await createThrowawayAdmin(page);

    await page.context().clearCookies();
    await signIn(page, account.username, account.password);
    await expect(page).toHaveURL("/change-password", { timeout: 20_000 });

    // The flag is a wall, not a suggestion: every other page sends them back.
    await page.goto("/students");
    await expect(page).toHaveURL("/change-password");

    // Seven characters. The old form checked this in the browser and the server
    // accepted six, so this is the assertion that finding 4 was about.
    await page.getByLabel("كلمة المرور الحالية").fill(account.password);
    await page.getByLabel("كلمة المرور الجديدة").fill("short12");
    await page.getByLabel("تأكيد كلمة المرور").fill("short12");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, /الحد الأدنى من الأحرف/).first()).toBeVisible();
    await expect(page).toHaveURL("/change-password");

    // A confirmation that does not match is refused on the server too.
    await page.getByLabel("كلمة المرور الجديدة").fill("LongEnough123");
    await page.getByLabel("تأكيد كلمة المرور").fill("LongEnough124");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, "كلمتا المرور غير متطابقتين.").first()).toBeVisible();

    // A wrong current password is refused with the same message a wrong sign-in gets.
    await page.getByLabel("كلمة المرور الحالية").fill("NotTheTemporaryOne1");
    await page.getByLabel("كلمة المرور الجديدة").fill("LongEnough123");
    await page.getByLabel("تأكيد كلمة المرور").fill("LongEnough123");
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, "اسم المستخدم أو كلمة المرور غير صحيحة.").first()).toBeVisible();

    // And now the real thing.
    await page.getByLabel("كلمة المرور الحالية").fill(account.password);
    await page.getByLabel("كلمة المرور الجديدة").fill("LongEnough123");
    await page.getByLabel("تأكيد كلمة المرور").fill("LongEnough123");
    await page.getByRole("button", { name: "حفظ" }).click();

    // Still signed in afterwards: `revokeOtherSessions` must not revoke this one.
    await expect(page).toHaveURL("/", { timeout: 20_000 });
    await page.goto("/students");
    await expect(page).toHaveURL("/students");

    // The point of the whole exercise: the password that was read out over the phone
    // no longer opens the account.
    await page.context().clearCookies();
    await signIn(page, account.username, account.password);
    await expect(visible(page, "اسم المستخدم أو كلمة المرور غير صحيحة.").first()).toBeVisible();

    await page.context().clearCookies();
    await signIn(page, account.username, "LongEnough123");
    await expect(page).toHaveURL("/", { timeout: 20_000 });
  });
});

test.describe("where login sends you afterwards", () => {
  test("still returns you to the page you were heading for", async ({ page }) => {
    await page.goto("/students");
    await expect(page).toHaveURL("/login?next=%2Fstudents", { timeout: 20_000 });

    await page.getByRole("tab", { name: "إدارة" }).click();
    await page.getByLabel("اسم المستخدم").fill("admin_nsr");
    await page.getByLabel("كلمة المرور").fill(PASSWORD);
    await page.getByRole("button", { name: "دخول" }).click();

    await expect(page).toHaveURL("/students", { timeout: 20_000 });
  });

  test("refuses to hand you to another origin", async ({ page }) => {
    // `//example.com` starts with "/" and is a different site. The attack is a link to
    // the REAL domain that signs you in legitimately and then drops you on a copy of
    // the login page.
    await page.goto("/login?next=%2F%2Fexample.com%2Flogin");
    await signIn(page, "admin_nsr", PASSWORD);

    await expect(page).toHaveURL("/", { timeout: 20_000 });
  });

  test("refuses a backslash, which the browser turns into a slash", async ({ page }) => {
    await page.goto("/login?next=%2F%5Cexample.com");
    await signIn(page, "admin_nsr", PASSWORD);

    await expect(page).toHaveURL("/", { timeout: 20_000 });
  });
});
