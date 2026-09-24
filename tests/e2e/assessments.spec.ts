import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * الدرجات, end to end (`drizzle/0021`, `drizzle/0022`).
 *
 * The assertion that matters most is the last one: a parent signed into the portal
 * sees a PUBLISHED paper and does not see a draft. Everything the office can get wrong
 * about marks is recoverable; a result that reached a family before it was ready is
 * not.
 *
 * The seed gives every class two papers — one published, one draft — so both halves
 * of that are there before this file opens a browser.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the marks screen", () => {
  test("lists the branch's papers, and says which have gone out to parents", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/assessments?from=2000-01-01&to=2100-01-01");

    // `toContainText`, not `toHaveText`: the heading carries the count beside the
    // title, which is the first thing anyone asks of a list.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(ar.assessments.title);
    // Both states are seeded, and the difference between them is the whole feature.
    await expect(page.getByText(ar.assessments.publishedBadge).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ar.assessments.draftBadge).first()).toBeVisible();
  });

  test("opens a sheet with the marks and the spread", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/assessments?from=2000-01-01&to=2100-01-01");

    await page
      .getByRole("link", { name: /اختبار|امتحان/ })
      .first()
      .click();
    await expect(page.getByText(ar.assessments.average).first()).toBeVisible({ timeout: 20_000 });
    // The sheet is a form of marks, one per student.
    await expect(
      page.getByRole("textbox", { name: new RegExp(`^${ar.assessments.score} — `) }).first(),
    ).toBeVisible();
  });

  test("warns that publishing reaches parents BEFORE the button, not after", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/assessments?from=2000-01-01&to=2100-01-01");

    const publish = page.getByRole("button", { name: new RegExp(`^${ar.assessments.publish} — `) }).first();
    await expect(publish).toBeVisible({ timeout: 20_000 });
    await publish.click();

    // It also has to say what a parent will NOT see, because that is the question the
    // office is actually asking itself at this moment.
    await expect(page.getByText(ar.assessments.publishDescription)).toBeVisible();
  });
});

test.describe("a teacher", () => {
  async function signInAsTeacher(page: Page) {
    await page.goto("/login");
    await page.getByRole("tab", { name: "معلم" }).click();
    // نهى سامي مصطفى — a teacher the seed actually gives papers to. The first
    // teacher in the list has none, and a test that passes because a screen is empty
    // is a test that would pass if the screen were broken.
    await page.getByLabel("رقم الهاتف").fill("01011110006");
    await page.getByLabel("كود الدخول").fill("123456");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
  }

  test("sees their own papers and has no way to publish one", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsTeacher(page);
    await page.goto("/teacher/assessments?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(ar.assessments.title);
    await expect(page.getByText(ar.assessments.teacherDescription)).toBeVisible();

    // They have papers, so the absence of the controls below means something.
    await expect(page.getByText(ar.assessments.draftBadge).first()).toBeVisible({ timeout: 20_000 });

    // Not disabled — ABSENT. Publishing is the office's act, and a greyed-out button
    // would still tell a teacher the power exists and is being withheld.
    await expect(page.getByRole("button", { name: new RegExp(`^${ar.assessments.publish} — `) })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: new RegExp(`^${ar.assessments.archive} — `) })).toHaveCount(
      0,
    );
  });

  test("is turned away from the office's marks screen", async ({ page }) => {
    test.setTimeout(120_000);
    await signInAsTeacher(page);
    await page.goto("/assessments");
    // The admin shell sends them back to their own area rather than to a 404.
    await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
  });
});

test.describe("a parent in the portal", () => {
  /** The seed prints these: the code, and the last four of the parent's phone. */
  const CHILD = { code: "NSR-26-00001", lastFour: "8001" };

  test("sees a PUBLISHED mark, and not the draft beside it", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/portal");
    await page.locator("#studentCode").fill(CHILD.code);
    await page.locator("#lastFour").fill(CHILD.lastFour);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByText(CHILD.code)).toBeVisible({ timeout: 20_000 });

    // The seed gives every class one published paper and one draft, both marked.
    await expect(page.getByText(ar.portal.gradesTitle).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("اختبار قصير — الوحدة الأولى").first()).toBeVisible();

    // THE assertion. A marked paper the office has not published must not be here by
    // any route, and `published_at IS NOT NULL` lives in the SQL rather than in a
    // query this test could be lying about.
    await expect(page.getByText("امتحان الشهر")).toHaveCount(0);
  });

  test("is told nothing about the class — no average, no rank", async ({ page }) => {
    test.setTimeout(120_000);

    await page.goto("/portal");
    await page.locator("#studentCode").fill(CHILD.code);
    await page.locator("#lastFour").fill(CHILD.lastFour);
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(page.getByText(ar.portal.gradesTitle).first()).toBeVisible({ timeout: 20_000 });

    // The centre declined both on 2026-09-24, and `app_portal_grades` does not return
    // either — so this is the screen agreeing with the database.
    await expect(page.getByText(ar.assessments.average)).toHaveCount(0);
    await expect(page.getByText(ar.assessments.highest)).toHaveCount(0);
  });
});
