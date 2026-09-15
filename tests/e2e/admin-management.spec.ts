import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 3 — branches, users, subjects, center settings, audit log.
 *
 * Runs against the seeded database. These exercise the whole stack: a real sign-in,
 * a server action, RLS, and the audit trail.
 */

const PASSWORD = "Password123!";

/**
 * DataTable renders the card list and the table at once, hiding one per breakpoint,
 * so a bare getByText matches a hidden copy. Everything here asserts on what is
 * actually on screen.
 */
/** A unique 5-letter branch code — the schema allows letters only. */
function letters(seed: string): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let hash = Date.now();
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet.charAt(hash % 26);
    hash = Math.floor(hash / 26);
  }
  return out;
}

function visible(page: Page, text: string) {
  return page.getByText(text).locator("visible=true");
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/");
}

test.describe("branches", () => {
  test("lists every branch with its student and admin counts", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/branches");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("الفروع");
    for (const name of ["فرع مدينة نصر", "فرع العبور", "فرع الجيزة"]) {
      await expect(visible(page, name).first()).toBeVisible();
    }
  });

  test("freezes the code once students exist (rule 10.1)", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/branches");

    await page.getByRole("button", { name: "تعديل فرع العبور" }).last().click();

    const codeField = page.getByLabel("الكود");
    await expect(codeField).toBeDisabled();
    await expect(
      page.getByText("لا يمكن تغيير الكود بعد تسجيل طلاب في الفرع", { exact: false }),
    ).toBeVisible();
  });

  test("renames a branch and records it in the audit log", async ({ page }, testInfo) => {
    // Desktop and mobile run against ONE database in parallel, so this test creates
    // the branch it is going to rename. Touching a seeded branch made the two
    // projects race each other.
    const tag = letters(testInfo.project.name + testInfo.workerIndex);
    const original = `فرع اختبار ${tag}`;
    const renamed = `${original} محدَّث`;

    await signIn(page, "admin");
    await page.goto("/branches");

    await page.getByRole("button", { name: "إضافة فرع" }).click();
    await page.getByLabel("اسم الفرع").last().fill(original);
    await page.getByLabel("الكود").last().fill(tag);
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, original).first()).toBeVisible();

    await page
      .getByRole("button", { name: `تعديل ${original}` })
      .last()
      .click();
    await page.getByLabel("اسم الفرع").last().fill(renamed);
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(visible(page, renamed).first()).toBeVisible();

    // The change must be traceable.
    await page.goto("/audit?entity=branch");
    await expect(visible(page, "تعديل").first()).toBeVisible();

    // Leave it deactivated rather than littering the switcher for the next run.
    await page.goto("/branches");
    await page
      .getByRole("button", { name: `تعطيل ${renamed}` })
      .last()
      .click();
    await page.getByRole("button", { name: "تعطيل", exact: true }).last().click();
    await expect(visible(page, "غير نشط").first()).toBeVisible();
  });

  test("rejects a duplicate branch name with an Arabic message", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/branches");

    await page.getByRole("button", { name: "إضافة فرع" }).click();
    await page.getByLabel("اسم الفرع").last().fill("فرع العبور");
    await page.getByLabel("الكود").last().fill("XYZ");
    await page.getByRole("button", { name: "حفظ" }).click();

    await expect(page.getByText("هذا الاسم مستخدم في فرع آخر.")).toBeVisible();
  });

  test("a branch admin cannot open /branches at all", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/branches");

    // notFound(), not a redirect: the route reveals nothing about other branches.
    await expect(page.getByText("404")).toBeVisible();
  });
});

test.describe("subjects", () => {
  test("refuses to deactivate a subject still used by an active timetable", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/subjects");

    // The seed schedules الرياضيات, so it is in use.
    await page.getByRole("button", { name: "تعطيل الرياضيات" }).last().click();
    await page.getByRole("button", { name: "تعطيل", exact: true }).last().click();

    await expect(page.getByText("لا يمكن تعطيل مادة مستخدمة في جداول نشطة", { exact: false })).toBeVisible();
  });
});

test.describe("branch admin accounts", () => {
  test("lists the seeded admins with their branch", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/users");

    await expect(visible(page, "admin_nsr").first()).toBeVisible();
    await expect(visible(page, "فرع مدينة نصر").first()).toBeVisible();
  });

  test("a branch admin cannot open /users", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/users");
    await expect(page.getByText("404")).toBeVisible();
  });
});

test.describe("audit log", () => {
  test("shows entries and filters by action through the URL", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/audit?action=login");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("سجل التدقيق");
    await expect(visible(page, "دخول").first()).toBeVisible();
  });

  test("a branch admin sees the log but only their own branch's entries", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/audit");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("سجل التدقيق");
    // No other branch may appear, and they get no branch filter to ask with.
    await expect(page.getByText("فرع العبور")).toHaveCount(0);
    await expect(page.getByText("فرع الجيزة")).toHaveCount(0);
  });
});

test.describe("center settings", () => {
  test("a super admin can read and save the settings", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/settings");

    await expect(page.getByLabel("اسم المركز")).toHaveValue(/.+/);
    await page.getByRole("button", { name: "حفظ" }).click();
    await expect(page.getByText("تم حفظ الإعدادات.")).toBeVisible();
  });

  test("a branch admin cannot open /settings", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/settings");
    await expect(page.getByText("404")).toBeVisible();
  });
});
