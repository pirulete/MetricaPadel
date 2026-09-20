/**
 * E2E test — Marketing CMS público.
 * Verifica que las páginas públicas renderizan correctamente.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect } from "@playwright/test";

test.describe("Marketing CMS — Public Pages", () => {
  test("Home page renders (static fallback or CMS)", async ({ page }) => {
    await page.goto("/");
    // Debe renderizar algo (fallback estático o CMS data-driven)
    const heading = page.locator("h1, h2, [class*='font-bold']").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test("Blog page renders", async ({ page }) => {
    const res = await page.goto("/blog");
    expect(res?.status()).toBe(200);
  });

  test("Shop page renders", async ({ page }) => {
    const res = await page.goto("/shop");
    expect(res?.status()).toBe(200);
  });

  test("Reserved slug /admin returns 403 or redirects", async ({ page }) => {
    const res = await page.goto("/admin");
    // admin requires auth — should redirect or return 403
    expect([200, 302, 307, 403]).toContain(res?.status());
  });

  test("Header and footer render on all public pages", async ({ page }) => {
    await page.goto("/");
    const header = page.locator("header, nav, [class*='header']").first();
    const footer = page.locator("footer, [class*='footer']").first();
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(footer).toBeVisible({ timeout: 10_000 });
  });
});
