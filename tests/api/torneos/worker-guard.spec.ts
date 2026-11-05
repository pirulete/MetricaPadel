/**
 * API tests del worker interno `POST /api/internal/tournament-worker` (M1):
 * fail-closed 503 sin secreto configurado · 401 sin header / con secreto
 * inválido · 400 `invalid_body` · 409 `not_claimed` (run inexistente o ya
 * reclamado) · el secreto nunca se refleja en la respuesta (AC-10).
 *
 * Limitación documentada: el proceso de test no puede borrar variables del
 * servidor ya arrancado, así que el caso 503 solo se ejecuta cuando el entorno
 * carece de `TOURNAMENT_WORKER_SECRET`; si está configurado se valida en su
 * lugar el 401 (contrato §6.4.1: el secreto ausente **o** inválido nunca pasa).
 *
 * @group api
 */
import { test, expect } from "@playwright/test";
import { BASE_URL } from "../admin/marketing/helpers";

const MISSING_RUN_ID = "00000000-0000-0000-0000-000000000001";
const WORKER_SECRET = process.env.TOURNAMENT_WORKER_SECRET?.trim() ?? "";
const HAS_SECRET = WORKER_SECRET.length > 0;

let serverProbe: Promise<boolean> | null = null;

function serverUp(): Promise<boolean> {
  if (!serverProbe) {
    serverProbe = fetch(`${BASE_URL}/api/auth/providers`, { signal: AbortSignal.timeout(2500) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return serverProbe;
}

test.describe("Tournament worker — guards del secreto", () => {
  test.beforeEach(async () => {
    test.skip(!(await serverUp()), `Servidor no disponible en ${BASE_URL}`);
  });

  test("503 fail-closed cuando TOURNAMENT_WORKER_SECRET no está configurado", async ({
    request,
  }) => {
    test.skip(
      HAS_SECRET,
      "El servidor de test tiene TOURNAMENT_WORKER_SECRET (no se puede desconfigurar en caliente); ver 401"
    );
    const res = await request.post(`${BASE_URL}/api/internal/tournament-worker`, {
      data: { runId: MISSING_RUN_ID },
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status()).toBe(503);
    expect((await res.json()).code).toBe("worker_not_configured");
  });

  test("401 sin header y con secreto inválido (nunca acepta cookie de sesión)", async ({
    request,
  }) => {
    test.skip(!HAS_SECRET, "Requiere TOURNAMENT_WORKER_SECRET configurado en el servidor");

    const noHeader = await request.post(`${BASE_URL}/api/internal/tournament-worker`, {
      data: { runId: MISSING_RUN_ID },
      headers: { "Content-Type": "application/json" },
    });
    expect(noHeader.status()).toBe(401);

    const wrongSecret = await request.post(`${BASE_URL}/api/internal/tournament-worker`, {
      data: { runId: MISSING_RUN_ID },
      headers: {
        "Content-Type": "application/json",
        "x-worker-secret": `${WORKER_SECRET}-invalido`,
      },
    });
    expect(wrongSecret.status()).toBe(401);
    // El secreto nunca se filtra en la respuesta (ni el esperado ni el enviado)
    const body = await wrongSecret.text();
    expect(body).not.toContain(WORKER_SECRET);
    expect(body).not.toContain("x-worker-secret");
  });

  test("400 invalid_body con runId que no es uuid", async ({ request }) => {
    test.skip(!HAS_SECRET, "Requiere TOURNAMENT_WORKER_SECRET configurado en el servidor");
    const res = await request.post(`${BASE_URL}/api/internal/tournament-worker`, {
      data: { runId: "no-es-uuid" },
      headers: { "Content-Type": "application/json", "x-worker-secret": WORKER_SECRET },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).code).toBe("invalid_body");
  });

  test("409 not_claimed con runId inexistente o ya reclamado (idempotente)", async ({
    request,
  }) => {
    test.skip(!HAS_SECRET, "Requiere TOURNAMENT_WORKER_SECRET configurado en el servidor");
    const res = await request.post(`${BASE_URL}/api/internal/tournament-worker`, {
      data: { runId: MISSING_RUN_ID },
      headers: { "Content-Type": "application/json", "x-worker-secret": WORKER_SECRET },
      timeout: 60_000,
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).code).toBe("not_claimed");
  });
});
