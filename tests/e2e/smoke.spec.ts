import { expect, test } from "@playwright/test";

test.describe("app shell", () => {
  test("renders the Arabic RTL login page", async ({ page }) => {
    // "/" is behind auth now, so the login screen is the public RTL surface.
    await page.goto("/login");

    const html = page.locator("html");
    await expect(html).toHaveAttribute("dir", "rtl");
    await expect(html).toHaveAttribute("lang", "ar");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("answers the health check", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
  });
});
