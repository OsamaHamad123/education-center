import { expect, test, type Download, type Page } from "@playwright/test";

/**
 * Audit phase D — files (docs/AUDIT-2026-09.md, findings 6 and 7).
 *
 * The export is checked against the REAL register rather than a fixture, because the
 * question the fix had to answer was not "does the escape work" — the unit tests settle
 * that — but "does it leave the ordinary rows alone". A phone is stored as
 * `+201012345678`, and an escape that put an apostrophe in front of every one of them
 * would be a regression dressed as a fix.
 */

const PASSWORD = "Password123!";

/** The bytes the browser actually saved, decoded as UTF-8. */
async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk as Uint8Array);
  return Buffer.from(Buffer.concat(chunks)).toString("utf8");
}

async function signIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "إدارة" }).click();
  await page.getByLabel("اسم المستخدم").fill(username);
  await page.getByLabel("كلمة المرور").fill(PASSWORD);
  await page.getByRole("button", { name: "دخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

test.describe("the students export", () => {
  test("carries no cell Excel would execute, and no apostrophe on a phone", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "mobile", "One project per run: it downloads a file.");
    test.setTimeout(120_000);

    await signIn(page, "admin_nsr");
    await page.goto("/students");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "تصدير CSV" }).locator("visible=true").first().click(),
    ]);

    const csv = await readDownload(download);

    // The BOM is what makes Excel read the Arabic names rather than mojibake. It is
    // asserted on the FILE, because `toCsv` emits one and the wire used to eat it.
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("student_code");

    const rows = csv
      .replace(/^﻿/, "")
      .split("\r\n")
      .filter((line) => line.length > 0);
    expect(rows.length).toBeGreaterThan(1);

    for (const row of rows) {
      for (const cell of row.split(",")) {
        // Nothing may begin a formula. `'` in front is the escape and is allowed.
        expect(cell, `cell in ${row}`).not.toMatch(/^"?[=@]/);
      }
    }

    // …and the phones came through as they are stored, with no escape in front.
    expect(csv).toMatch(/,\+20\d{10},/);
    expect(csv).not.toContain(",'+20");
  });
});

test.describe("the uploads directory", () => {
  test("is served under a policy that cannot run a script", async ({ page }) => {
    // The logo allowlist includes SVG, and an SVG is a document. This second policy
    // narrows what the page-level CSP allows, so a script inside one is inert even
    // when the file is opened directly.
    const response = await page.goto("/uploads/logo-does-not-exist.svg");
    const csp = response?.headers()["content-security-policy"] ?? "";

    expect(csp).toContain("sandbox");
    expect(csp).toContain("default-src 'none'");
  });
});
