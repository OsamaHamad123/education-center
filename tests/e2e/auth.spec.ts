import { expect, test, type Page } from "@playwright/test";

/**
 * Login flows for each seeded role (PROJECT_PLAN Phase 2, task 8).
 *
 * These run against the seeded database: `pnpm db:up && pnpm db:migrate && pnpm db:seed`.
 * The credentials below are the ones the seed prints.
 */

const PASSWORD = "Password123!";
const TEACHER_PHONE = "01011110001";
const TEACHER_CODE = "123456";

async function signInAsAdmin(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
}

test.describe("login", () => {
  test("super admin lands on the dashboard with a branch switcher", async ({ page }) => {
    await signInAsAdmin(page, "admin");

    // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
    // once — 5 seconds is the default, not a budget this navigation was ever meant to
    // fit. A single sign-in against an idle server takes ~0.2s.
    await expect(page).toHaveURL("/", { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toContainText("الإدارة العامة");
    await expect(page.getByRole("combobox", { name: "تبديل الفرع" })).toBeVisible();
    // No branch selected yet, so mutations are off and the banner says so.
    await expect(page.getByText("كافة الفروع", { exact: false }).first()).toBeVisible();
  });

  test("branch admin lands on the dashboard with NO branch switcher", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");

    // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
    // once — 5 seconds is the default, not a budget this navigation was ever meant to
    // fit. A single sign-in against an idle server takes ~0.2s.
    await expect(page).toHaveURL("/", { timeout: 20_000 });
    await expect(page.getByRole("combobox", { name: "تبديل الفرع" })).toHaveCount(0);
    // Their branch is stated in the banner, at every width.
    await expect(page.getByText("الفرع النشط: فرع مدينة نصر")).toBeVisible();
  });

  test("teacher signs in with a phone number and lands in the teacher portal", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill(TEACHER_PHONE);
    await page.getByLabel("كود الدخول").fill(TEACHER_CODE);
    await page.getByRole("button", { name: "دخول" }).click();

    // A teacher redirected from "/" ends up in their own portal.
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("wrong credentials give one generic message, not 'no such user'", async ({ page }) => {
    await signInAsAdmin(page, "no_such_admin");

    // Next's route announcer is also role="alert", so target the message itself.
    await expect(page.getByText("اسم المستخدم أو كلمة المرور غير صحيحة.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("route protection", () => {
  test("an anonymous visitor is sent to login and returned afterwards", async ({ page }) => {
    await page.goto("/payroll");

    await expect(page).toHaveURL(/\/login\?next=%2Fpayroll/);
  });

  test("a branch admin has no link to /branches in the navigation", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");
    // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
    // once — 5 seconds is the default, not a budget this navigation was ever meant to
    // fit. A single sign-in against an idle server takes ~0.2s.
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    // Below the lg breakpoint the sidebar collapses into a sheet, so open it first.
    const menu = page.getByRole("button", { name: "القائمة" });
    if (await menu.isVisible()) await menu.click();

    // Both navs are in the DOM at once (one is display:none per breakpoint), so
    // scope to the visible one — otherwise .first() picks the hidden sidebar.
    const nav = page.locator("nav:visible").first();

    // The route itself is Phase 3; what matters here is that the way in is absent.
    await expect(nav.locator('a[href="/branches"]')).toHaveCount(0);
    await expect(nav.locator('a[href="/students"]')).toBeVisible();
  });

  test("a teacher sent to the dashboard is redirected to their portal", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    await page.getByLabel("رقم الهاتف").fill(TEACHER_PHONE);
    await page.getByLabel("كود الدخول").fill(TEACHER_CODE);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });

    await page.goto("/");
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
  });
});

test.describe("branch switching", () => {
  test("choosing a branch replaces the read-only banner with the active branch", async ({ page }) => {
    await signInAsAdmin(page, "admin");
    // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
    // once — 5 seconds is the default, not a budget this navigation was ever meant to
    // fit. A single sign-in against an idle server takes ~0.2s.
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await page.getByRole("combobox", { name: "تبديل الفرع" }).click();
    await page.getByRole("option", { name: "فرع العبور" }).click();

    await expect(page.getByText("الفرع النشط:")).toBeVisible();
    await expect(page.getByText("فرع العبور").first()).toBeVisible();
    await expect(page.getByText("العرض فقط", { exact: false })).toHaveCount(0);
  });
});

test.describe("logout", () => {
  test("returns to login and the session no longer opens the dashboard", async ({ page }) => {
    await signInAsAdmin(page, "admin_nsr");
    // Signing in deliberately costs a scrypt hash, and the suite runs eight browsers at
    // once — 5 seconds is the default, not a budget this navigation was ever meant to
    // fit. A single sign-in against an idle server takes ~0.2s.
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await page.getByRole("button", { name: "حسابي" }).click();
    await page.getByRole("menuitem", { name: "تسجيل الخروج" }).click();

    await expect(page).toHaveURL(/\/login/);

    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });
});
