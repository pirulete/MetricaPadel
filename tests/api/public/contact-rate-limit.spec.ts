/**
 * API test — Contact form rate limiting.
 * Verifica que POST /api/public/contact respeta rate limit por IP.
 * Requiere servidor corriendo en http://localhost:3000.
 */
import { test, expect, request as pwRequest } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

let serverProbe: Promise<boolean> | null = null;

/** Skip graceful si no hay servidor en BASE_URL (patrón tests/api/auth/helpers). */
function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/csrf`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

test.describe("POST /api/public/contact — Rate limit", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("returns 429 after exceeding rate limit", async () => {
    const ctx = await pwRequest.newContext({ baseURL: BASE_URL });
    try {
      // Send enough requests to trigger rate limit
      // The default limit is 10 per 60s for public endpoints
      let hitLimit = false;
      for (let i = 0; i < 15; i++) {
        const res = await ctx.post("/api/public/contact", {
          data: { name: "Test", email: "test@example.com", message: "Hello" },
        });
        if (res.status() === 429) {
          hitLimit = true;
          const body = await res.json();
          expect(body).toHaveProperty("error");
          break;
        }
      }
      // At least one should have been rate-limited
      expect(hitLimit).toBe(true);
    } finally {
      await ctx.dispose();
    }
  });
});
