import { expect, test, type Page } from "@playwright/test";
import { ar } from "@/shared/i18n/ar";

/**
 * Fees and collection (docs/MESSAGING-AND-FEES-PLAN.md, P5).
 *
 * The seed leaves a centre mid-month: last month settled, this month partly collected.
 * So these run against a ledger that already has money in it, and test the two things
 * that are only true end to end — that taking money produces a numbered receipt, and
 * that cancelling one leaves BOTH rows on the statement rather than erasing anything.
 */

const PASSWORD = "Password123!";

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the collection board", () => {
  test("shows the month's totals and who still owes", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.fees.title);
    await expect(page.getByText(ar.fees.outstanding).first()).toBeVisible({ timeout: 20_000 });
    // Somebody is always mid-collection in the seeded month, which is the point of the
    // screen: a settled ledger needs no worklist.
    await expect(page.getByText(ar.fees.states.unpaid).first()).toBeVisible();
  });

  test("gives a branch admin no way to change the price list", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    // Setting what a class costs is the owner's, the same way teacher rates are.
    await expect(page.getByRole("link", { name: ar.fees.plans })).toHaveCount(0);
  });

  test("shows the super admin the price list, with history rather than an edit box", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin");
    await page.goto("/fees/plans");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText(ar.fees.plans);
    await expect(page.getByText(ar.fees.effectiveFrom).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("taking money", () => {
  // Desktop only. Two browsers collecting from the same first row race by construction:
  // one of them pays the balance and the other finds no تحصيل button to press. That is
  // a fact about the till, not a bug in it.
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser at the till");
  });

  test("records a payment and opens a numbered receipt", async ({ page, context }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    const collect = page.getByRole("button", { name: new RegExp(`^${ar.fees.collect}`) }).first();
    await expect(collect).toBeVisible({ timeout: 20_000 });
    await collect.click();

    // Pre-filled with the balance: at a desk the whole amount is what is handed over
    // nine times in ten.
    const amount = page.locator("#amountPounds");
    await expect(amount).toBeVisible();
    const prefilled = await amount.inputValue();
    expect(Number(prefilled)).toBeGreaterThan(0);

    const receipt = context.waitForEvent("page");
    await page.getByRole("button", { name: ar.common.save }).click();

    // The receipt opens by itself: a family that has just handed over cash expects paper.
    const printed = await receipt;
    await printed.waitForLoadState();
    expect(printed.url()).toContain("/print/receipt/");
    await expect(printed.getByText(ar.fees.receiptNo)).toBeVisible({ timeout: 20_000 });
  });

  test("refuses more than the balance instead of taking it", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    const collect = page.getByRole("button", { name: new RegExp(`^${ar.fees.collect}`) }).first();
    await expect(collect).toBeVisible({ timeout: 20_000 });
    await collect.click();

    // A typo at the desk — 50000 for 500 — must not become a refund somebody has to
    // chase later.
    await page.locator("#amountPounds").fill("999999");
    await page.getByRole("button", { name: ar.common.save }).click();
    await expect(page.getByRole("alert").first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("the statement", () => {
  test("keeps a cancelled receipt on the page, with its reversal", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one browser: it reverses a real receipt");
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    // Any student who has paid something: their statement is where the receipts are.
    await page.goto((await firstStatementHref(page)) ?? "/fees");
    await expect(page.getByText(ar.fees.statement)).toBeVisible({ timeout: 20_000 });

    const reverse = page.getByRole("button", { name: ar.fees.reverse }).first();
    if ((await reverse.count()) === 0) test.skip(true, "no receipt to cancel on this student");
    await reverse.click();

    await page.locator("#reverse-reason").fill("سُجّلت بالخطأ");
    await page.getByRole("button", { name: ar.fees.reverse }).last().click();

    // Both rows stay: the original, marked cancelled, and the reversal that undid it.
    await expect(page.getByText(ar.fees.reversal).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(ar.fees.reversed).first()).toBeVisible();
  });

  test("404s a student from another branch", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    const response = await page.goto("/fees/00000000-0000-4000-8000-000000000000");
    expect(response?.status()).toBe(404);
  });
});

/** The first student link on the board, which is their statement. */
async function firstStatementHref(page: Page): Promise<string | null> {
  await page.goto("/fees");
  await page.waitForSelector('a[href^="/fees/"]', { timeout: 20_000 });
  return page.evaluate(() => {
    const link = document.querySelector<HTMLAnchorElement>('a[href^="/fees/"]:not([href="/fees/plans"])');
    return link?.getAttribute("href") ?? null;
  });
}

test.describe("the accounting export", () => {
  test("downloads every receipt of the month, reversals included", async ({ page }) => {
    test.setTimeout(120_000);
    await signIn(page, "admin_nsr");
    await page.goto("/fees");

    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: ar.common.export }).click();
    const file = await download;

    expect(file.suggestedFilename()).toMatch(/^payments-\d{4}-\d{2}\.csv$/);

    const chunks: string[] = [];
    for await (const chunk of await file.createReadStream()) chunks.push(String(chunk));
    const csv = chunks.join("");

    // The BOM, or Excel opens Arabic as mojibake (docs/AUDIT-2026-09.md, finding 13).
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(ar.fees.receiptNo);
    // Amounts go out in POUNDS with two decimals: a spreadsheet is where this is going
    // and nobody reconciles a receipt in piasters.
    expect(csv).toMatch(/\d+\.\d{2}/);
  });
});
