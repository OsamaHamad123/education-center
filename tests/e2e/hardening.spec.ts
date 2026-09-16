import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 10 hardening (docs/SECURITY-REVIEW.md), from the outside.
 *
 * These assert on what the server actually SENDS — headers, status codes, the page a
 * user lands on — rather than on the code that produces it. A header that is
 * configured but not served is not a defence.
 */

const PASSWORD = "Password123!";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("security headers", () => {
  test("are served on the public page", async ({ page }) => {
    const response = await page.goto("/lookup");
    const headers = response?.headers() ?? {};

    // Nothing may frame this app: a clickjacking page could otherwise lay an
    // invisible edit form over a game and harvest the clicks.
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    // The absence alerts link to wa.me; the default Referer would have sent it a
    // path containing a student id.
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  test("are served on the signed-in area too", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const response = await page.goto("/students");

    expect(response?.headers()["content-security-policy"]).toContain("default-src 'self'");
  });

  test("do not advertise the framework", async ({ page }) => {
    const response = await page.goto("/lookup");
    expect(response?.headers()["x-powered-by"]).toBeUndefined();
  });

  test("forbid eval, which is the one CSP line that stops most injected payloads", async ({ page }) => {
    const response = await page.goto("/lookup");
    expect(response?.headers()["content-security-policy"]).not.toContain("unsafe-eval");
  });
});

test.describe("error pages", () => {
  test("a signed-in user gets an ARABIC 404", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const response = await page.goto("/no-such-page-at-all");

    expect(response?.status()).toBe(404);
    await expect(visible(page, "الصفحة غير موجودة").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "العودة للرئيسية" })).toBeVisible();
  });

  test("says the same thing for a real id the viewer may not see", async ({ page }) => {
    // Branch isolation's 404 and a genuine 404 must be indistinguishable, or the URL
    // becomes a question the app answers honestly.
    await signIn(page, "admin_nsr");
    const response = await page.goto("/students/00000000-0000-4000-8000-000000000000");

    expect(response?.status()).toBe(404);
    await expect(visible(page, "الصفحة غير موجودة").first()).toBeVisible();
  });

  test("returns 404, not 500, for a malformed id", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const response = await page.goto("/students/not-a-uuid");

    // Before Phase 10 this reached Postgres, failed to cast and surfaced as a 500 —
    // which is both an unwritten error page and a measurable difference.
    expect(response?.status()).toBe(404);
  });
});

test.describe("the health endpoint", () => {
  test("is reachable without a session and reports only a status", async ({ page }) => {
    await page.context().clearCookies();
    const response = await page.goto("/api/health");

    expect(response?.status()).toBe(200);
    const body: unknown = await response?.json();
    // No version, no hostname, no error text: this is the most exposed route there is.
    expect(body).toEqual({ status: "ok" });
  });
});

test.describe("per-account lockout", () => {
  test("locks a username after repeated failures, and locks one that does not exist", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: the lock is 15 minutes.");

    // A username nobody uses, for two reasons: it cannot lock out a real account for
    // the rest of the suite, and locking a NON-EXISTENT name is itself the correct
    // behaviour — a lockout that only applied to real accounts would tell an attacker
    // which usernames exist.
    const username = `ghost_${Date.now().toString(36)}`;

    for (let attempt = 0; attempt < 10; attempt++) {
      await page.goto("/login");
      await page.getByLabel("اسم المستخدم").fill(username);
      await page.getByLabel("كلمة المرور").fill("wrong-password");
      await page.getByRole("button", { name: "دخول" }).click();
      // The MESSAGE, not `role=alert`: Next's route announcer is also an alert and is
      // always present, so waiting on the role passes instantly and the loop races
      // ahead of the requests it is supposed to be counting.
      await expect(visible(page, "اسم المستخدم أو كلمة المرور غير صحيحة.").first()).toBeVisible();
    }

    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill(username);
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول" }).click();

    await expect(visible(page, /تم إيقاف هذا الحساب مؤقتاً/).first()).toBeVisible();
  });

  test("does not lock a legitimate user who mistypes once", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("اسم المستخدم").fill("admin_nsr");
    await page.getByLabel("كلمة المرور").fill("wrong-password");
    await page.getByRole("button", { name: "دخول" }).click();
    await expect(visible(page, "اسم المستخدم أو كلمة المرور غير صحيحة.").first()).toBeVisible();

    // …and the correct password still works, and clears the count.
    await signIn(page, "admin_nsr");
    await expect(page).toHaveURL("/");
  });
});
