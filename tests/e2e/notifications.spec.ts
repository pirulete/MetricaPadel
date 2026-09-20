/**
 * E2E — Notification inbox.
 * - Sin sesión → /notifications redirige a login.
 * - Con sesión → heading "Notificaciones" visible.
 * Requiere servidor en http://localhost:3000; el happy-path requiere DATABASE_URL.
 */
import { test, expect } from "@playwright/test";
import {
  createUser,
  deleteUserByEmail,
  signIn,
} from "../api/admin/marketing/helpers";

const USER_EMAIL = `e2e-notif-${Date.now()}@test.local`;
const USER_PASSWORD = "TestPass123!";

test.describe("Notification inbox — E2E", () => {
  test("Sin sesión → redirect a login", async ({ page }) => {
    await page.goto("/notifications");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test("Con sesión → heading Notificaciones visible", async ({ page }) => {
    test.skip(!process.env.DATABASE_URL, "Requiere DATABASE_URL (SQL real)");
    await createUser({ role: "USER", email: USER_EMAIL, password: USER_PASSWORD });
    try {
      // signIn usa page.request (mismo cookie jar que el browser context)
      await signIn(page.request, USER_EMAIL, USER_PASSWORD);
      await page.goto("/notifications");
      await expect(
        page.getByRole("heading", { name: "Notificaciones" })
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteUserByEmail(USER_EMAIL);
    }
  });
});