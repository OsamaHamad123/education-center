import { expect, test, type Page } from "@playwright/test";

/**
 * Audit phase C — attendance (docs/AUDIT-2026-09.md, findings 1 and 2).
 *
 * The same class of bug as phase B, on the screens that are used every day rather than
 * at the end of a month. One difference matters and is asserted below: the board falls
 * back, the marking screen refuses. Opening a register for a day nobody asked for is
 * worse than an error page, because somebody then writes on it.
 */

const PASSWORD = "Password123!";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

/** The class the board opens on, taken from the URL it redirects to. */
async function firstClassId(page: Page): Promise<string> {
  await page.goto("/attendance");
  await expect(page).toHaveURL(/classId=/, { timeout: 20_000 });
  const classId = new URL(page.url()).searchParams.get("classId");
  expect(classId).toMatch(/^[0-9a-f-]{36}$/);
  return classId as string;
}

test.describe("a nonsense date in the attendance URL", () => {
  test("opens the board on today instead of a 500", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    const dateField = page.getByLabel("التاريخ").locator("visible=true").first();

    for (const date of ["not-a-date", "2026-02-31", "2026-13-01", "..%2F..%2Fetc"]) {
      const response = await page.goto(`/attendance?date=${date}`);
      expect(response?.status(), `?date=${date} should render`).toBe(200);
      await expect(dateField).toHaveValue(ISO_DATE);
    }
  });

  test("does not carry the bad date through the class redirect", async ({ page }) => {
    await signIn(page, "admin_nsr");

    // An unknown class redirects to the first one. That URL used to be built with the
    // raw date, so the crash simply moved to the next request.
    const response = await page.goto("/attendance?classId=not-a-uuid&date=abc");
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).searchParams.get("date")).toMatch(ISO_DATE);
  });

  test("renders the sessions log with a broken range or filter", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");

    const urls = [
      "/attendance/sessions?from=abc&to=def",
      "/attendance/sessions?from=2026-02-31&to=2026-09-30",
      "/attendance/sessions?classId=not-a-uuid",
      "/attendance/sessions?teacherId=not-a-uuid",
      "/attendance/sessions?status=whatever",
    ];

    for (const url of urls) {
      const response = await page.goto(url);
      expect(response?.status(), `${url} should render`).toBe(200);
      await expect(page.locator("#sessions-from")).toHaveValue(ISO_DATE);
      await expect(page.locator("#sessions-to")).toHaveValue(ISO_DATE);
    }
  });

  test("still shows the range that was asked for", async ({ page }) => {
    await signIn(page, "admin_nsr");

    await page.goto("/attendance/sessions?from=2026-09-01&to=2026-09-10");
    await expect(page.locator("#sessions-from")).toHaveValue("2026-09-01");
    await expect(page.locator("#sessions-to")).toHaveValue("2026-09-10");
  });
});

test.describe("the register you write on", () => {
  test("refuses a date that is not a day, rather than guessing one", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const classId = await firstClassId(page);

    // The deliberate difference from the board. `2026-02-31` has the right shape, and
    // the old regex let it through to a throw; a silent fall back to today would be
    // worse still, because the next tap writes a register for the wrong day.
    for (const date of ["2026-02-31", "not-a-date", "2026-13-01"]) {
      const response = await page.goto(`/attendance/mark?classId=${classId}&date=${date}&period=1`);
      expect(response?.status(), `?date=${date} should 404`).toBe(404);
    }
  });

  test("still opens for a real day", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const classId = await firstClassId(page);
    const today = new URL(page.url()).searchParams.get("date") ?? "";

    const response = await page.goto(`/attendance/mark?classId=${classId}&date=${today}&period=1`);
    expect(response?.status()).toBe(200);
  });
});
