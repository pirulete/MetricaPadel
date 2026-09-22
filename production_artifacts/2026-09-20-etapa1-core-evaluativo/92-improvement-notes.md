# Improvement Notes — Validación API tests padel (2026-09-21)

## Hallazgo crítico: la suite API completa se salta silenciosamente

**Síntoma**: `npx playwright test tests/api/padel/` → 22/22 skipped. `tests/api/auth/` → 4/4 skipped.

**Causa raíz**: `serverUp()` en `tests/api/padel/*.spec.ts`, `tests/api/auth/helpers.ts` y `tests/api/admin/marketing/helpers.ts` sondea `GET /api/auth/csrf` para detectar si el servidor está arriba. Pero `auth.ts:172` habilita `skipCSRFCheck` en development:

```ts
skipCSRFCheck: (process.env.NODE_ENV === "development" ? skipCSRFCheck : undefined) as any,
```

Con `skipCSRFCheck`, Auth.js desactiva el endpoint csrf → `GET /api/auth/csrf` devuelve **404** (verificado: `curl -i` muestra 404 + borrado de cookie `authjs.csrf-token`). El probe falla → `test.skip(!(await serverUp()))` salta todos los tests.

**Impacto**: El gate `api_tests` del harness (`lib/modules/harness/gates.js:17`) ejecuta el mismo comando y Playwright sale con **exit code 0** cuando los tests se saltan → el harness reportó `api_tests: pass` en `.validation/status.json` (2026-09-20T23:50Z) sin que NINGÚN test de API haya corrido realmente. La validación de los 15 endpoints padel fue vacua.

**Fix recomendado** (no aplicado — fuera de alcance del validador):
1. Cambiar el probe de `serverUp()` a un endpoint que siempre responda 200, p. ej. `GET /api/auth/providers` (verificado: 200) o `GET /` (200).
2. Alternativa: en `createAuthedContext` (helpers), el flujo de sign-in también depende de `/api/auth/csrf` para obtener el token — con `skipCSRFCheck` el sign-in por credentials con `csrfToken` puede fallar. Evaluar si el flujo de login de los tests necesita adaptarse (p. ej. enviar `csrfToken: ""` o usar el endpoint `/api/auth/signin` directo).
3. Considerar que el harness detecte "0 tests ejecutados" como fallo en vez de pass.

## Verificado OK
- Servidor arriba: `/` 200, `/login` 200, `/api/auth/providers` 200, `/api/auth/session` 200.
- Guards padel funcionan: `/api/rubrics`, `/api/evaluations`, `/api/student/evaluations`, `/api/admin/users` → 401 sin sesión.
- E2E `tests/e2e/padel-evaluation.spec.ts`: **9/9 passed** (auth redirects + 401 guards).