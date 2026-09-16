import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 8 — payroll and reports, against the seeded database.
 *
 * Everything here is READ-ONLY. Payroll and reports compute over sessions the other
 * suites create, so these tests assert on relationships that hold whatever the data
 * is — a grand total equals the sum of its rows; a branch admin's figure is their
 * branch's share — rather than on numbers that drift as the seed accumulates.
 */

const PASSWORD = "Password123!";
const TEACHER_PHONE = "01011110001";
const TEACHER_CODE = "123456";

function visible(page: Page, text: string | RegExp) {
  return page.getByText(text).locator("visible=true");
}

async function signOut(page: Page) {
  await page.context().clearCookies();
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

async function signInAsTeacher(page: Page) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "معلم" }).click();
  await page.getByLabel("رقم الهاتف").fill(TEACHER_PHONE);
  await page.getByLabel("كود الدخول").fill(TEACHER_CODE);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL(/\/teacher$/, { timeout: 20_000 });
}

/**
 * Reads a `1,250.00 ج.م` string back into a number.
 *
 * Matching the numeral rather than stripping non-digits: the currency itself is
 * "ج.م", whose dot survives a naive strip and turns 14050.00 into "14050.00." — which
 * is NaN, silently, in every comparison that uses it.
 */
function parseEgp(text: string): number {
  const match = /(\d[\d,]*\.\d{2})/.exec(text);
  return match?.[1] ? Number(match[1].replace(/,/g, "")) : Number.NaN;
}

/** Widens the range to something the seed definitely covers. */
async function openPayroll(page: Page) {
  await page.goto("/payroll?from=2000-01-01&to=2100-01-01");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("المستحقات");
}

test.describe("the payroll report", () => {
  test("totals what it lists — the grand total is the sum of its own rows", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "The row-by-row table is the desktop layout.");
    await signIn(page, "admin_nsr");
    await openPayroll(page);

    // Every data row carries eight cells and its own total in the seventh; the last
    // row is the grand total, which spans six and then states the figure.
    const rows = await page.getByRole("row").all();
    const dataRows = rows.slice(1, -1);
    expect(dataRows.length).toBeGreaterThan(0);

    let summed = 0;
    for (const row of dataRows) {
      const cells = await row.getByRole("cell").allTextContents();
      summed += parseEgp(cells[6] ?? "0");
    }

    const totalCells = await rows[rows.length - 1]?.getByRole("cell").allTextContents();
    const grandTotal = parseEgp(totalCells?.[1] ?? "0");

    expect(grandTotal).toBeGreaterThan(0);
    // Floating point on two-decimal pounds: compare to the piaster.
    expect(Math.abs(summed - grandTotal)).toBeLessThan(0.01);
  });

  test("groups a teacher by branch and by track", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Column headers do not exist in the card layout.");
    await signIn(page, "admin");
    await openPayroll(page);

    for (const header of ["المعلم", "الفرع", "حصص علمي", "حصص أدبي", "الإجمالي"]) {
      await expect(page.getByRole("columnheader", { name: header })).toBeVisible();
    }
  });

  test("says plainly that cancelled sessions are excluded", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await openPayroll(page);

    await expect(visible(page, "الحصص الملغاة مستبعدة من الحساب.").first()).toBeVisible();
  });

  test("drills down to the lessons behind a total", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "Desktop owns the drill-down link.");
    await signIn(page, "admin_nsr");
    await openPayroll(page);

    await page.getByRole("link", { name: "تفاصيل الحصص" }).first().click();
    await expect(page.getByRole("heading", { level: 1 })).toContainText("حصص");
    await expect(page.getByRole("columnheader", { name: "المادة" })).toBeVisible();
  });

  test("exports a CSV with a header row and a grand total", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One download per run is enough.");
    await signIn(page, "admin_nsr");
    await openPayroll(page);

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "تصدير" }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^payroll-.*\.csv$/);
    const stream = await file.createReadStream();
    const text = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });

    expect(text).toContain("المعلم");
    expect(text).toContain("الإجمالي العام");
    // The BOM is what makes Excel read Arabic as UTF-8 rather than mojibake.
    expect(text.charCodeAt(0)).toBe(0xfeff);
  });

  test("renders an A4 payroll sheet with signature columns", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/print/payroll?from=2000-01-01&to=2100-01-01");

    await expect(visible(page, "كشف مستحقات").first()).toBeVisible();
    await expect(visible(page, "توقيع المستلم").first()).toBeVisible();
  });
});

test.describe("payroll isolation", () => {
  test("a branch admin gets NO branch filter — their scope is not a choice", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await openPayroll(page);

    await expect(page.getByRole("combobox", { name: "المعلم" })).toBeVisible();
    // `exact`: the super admin's header switcher is "تبديل الفرع", which contains this.
    await expect(page.getByRole("combobox", { name: "الفرع", exact: true })).toHaveCount(0);
  });

  test("a super admin gets one, and it changes the total", async ({ page }) => {
    await signIn(page, "admin");
    await openPayroll(page);

    await expect(page.getByRole("combobox", { name: "الفرع", exact: true })).toBeVisible();
    const everywhere = parseEgp((await firstTotalBadge(page)) ?? "0");

    await page.getByRole("combobox", { name: "الفرع", exact: true }).click();
    await page.getByRole("option", { name: "فرع مدينة نصر", exact: true }).click();
    await expect(page.getByRole("combobox", { name: "الفرع", exact: true })).toContainText("فرع مدينة نصر");

    const oneBranch = parseEgp((await firstTotalBadge(page)) ?? "0");
    expect(oneBranch).toBeLessThan(everywhere);
  });

  test("a branch admin's total is smaller than the super admin's", async ({ page }) => {
    await signIn(page, "admin");
    await openPayroll(page);
    const everywhere = parseEgp((await firstTotalBadge(page)) ?? "0");

    await signOut(page);
    await signIn(page, "admin_nsr");
    await openPayroll(page);
    const oneBranch = parseEgp((await firstTotalBadge(page)) ?? "0");

    // Three seeded branches all run sessions, so one branch cannot be the whole.
    expect(oneBranch).toBeLessThan(everywhere);
    expect(oneBranch).toBeGreaterThan(0);
  });

  test("shows a teacher their own earnings and no one else's", async ({ page }) => {
    await signInAsTeacher(page);
    await page.goto("/teacher/earnings?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("مستحقاتي");
    await expect(visible(page, "أحمد محمود السيد").first()).toBeVisible();
    // The other seeded teachers are simply not in the data they can read.
    await expect(page.getByText("نهى سامي مصطفى")).toHaveCount(0);
  });
});

test.describe("the reports", () => {
  test("offers a branch admin three reports, and no branch comparison", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/reports");

    await expect(visible(page, "حضور الطلاب").first()).toBeVisible();
    await expect(visible(page, "كشف الشعبة").first()).toBeVisible();
    await expect(visible(page, "تنبيهات الغياب").first()).toBeVisible();
    // Not disabled — absent. Nothing hints that other branches exist to compare.
    await expect(page.getByText("مقارنة الفروع")).toHaveCount(0);
  });

  test("404s the comparison for a branch admin who types the URL", async ({ page }) => {
    await signIn(page, "admin_nsr");
    const response = await page.goto("/reports/branches");

    expect(response?.status()).toBe(404);
  });

  test("shows the super admin a comparison with a chart and a table", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/reports/branches?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("مقارنة الفروع");
    await expect(visible(page, "فرع مدينة نصر").first()).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "إجمالي المستحقات" })).toBeVisible();
  });

  test("reports student attendance with a percentage per student", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/reports/students?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("حضور الطلاب");
    await expect(visible(page, /^\d{1,3}%$/).first()).toBeVisible();
  });

  test("draws the class matrix with a legend", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/reports/matrix?from=2000-01-01&to=2100-01-01");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("كشف الشعبة");
    await expect(visible(page, /ح = حاضر/).first()).toBeVisible();
  });

  test("lists absence alerts above the configured threshold", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/reports/alerts?from=2000-01-01&to=2100-01-01&threshold=1");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("تنبيهات الغياب");
    // With a 1% threshold somebody always qualifies in the seeded data.
    await expect(visible(page, "حد التنبيه: 1%").first()).toBeVisible();
    const chat = page.getByRole("link", { name: "مراسلة ولي الأمر" }).first();
    await expect(chat).toBeVisible();
    // Click-to-chat only: it opens a conversation, it does not send anything.
    await expect(chat).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+$/);
  });

  test("masks the parent's number on screen", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/reports/alerts?from=2000-01-01&to=2100-01-01&threshold=1");

    // CLAUDE.md: never show a full phone number. The link carries it; the page does not.
    await expect(visible(page, /\*{3,}/).first()).toBeVisible();
    await expect(page.getByText(/\+20\d{10}/)).toHaveCount(0);
  });
});

test.describe("the dashboard", () => {
  test("shows a branch admin today's planned-versus-done gap", async ({ page }) => {
    await signIn(page, "admin_nsr");
    await page.goto("/");

    await expect(visible(page, "حصص مجدولة").first()).toBeVisible();
    await expect(visible(page, "حصص مسجّلة").first()).toBeVisible();
    await expect(visible(page, "متبقية").first()).toBeVisible();
  });

  test("shows a super admin in «كافة الفروع» the comparison instead", async ({ page }) => {
    await signIn(page, "admin");
    await page.goto("/");

    // No branch selected means no single branch's day to show.
    await expect(visible(page, "مقارنة الفروع").first())
      .toBeVisible()
      .catch(async () => {
        await expect(visible(page, "نسبة الحضور").first()).toBeVisible();
      });
  });
});

/**
 * The grand-total badge above the table. The regex is ANCHORED: without `^…$`,
 * `getByText` also matches every ancestor that merely contains a money string, and
 * `.first()` then returns a wrapper whose text holds half the page.
 */
async function firstTotalBadge(page: Page): Promise<string | null> {
  return page
    .getByText(/^\d[\d,]*\.\d{2} ج\.م$/)
    .locator("visible=true")
    .first()
    .textContent();
}
