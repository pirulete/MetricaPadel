# Test Matrix — Editor de Transiciones (coach)

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02 · ejecutado por @qa-release
> entorno: `DATABASE_URL=postgresql://padel:padel_dev_2026@localhost:5434/padel_evaluation?sslmode=disable`, dev server `localhost:3000`

## 1. Suite ejecutada (resumen)

| Suite | Comando | Resultado |
|-------|---------|-----------|
| Unit (Jest, completa) | `npx jest` | 65 suites / **849 tests** — ✅ 849 passed, 0 failed (7.0 s) |
| API SQL real | `npx playwright test tests/api/padel/transitions-happy.spec.ts tests/api/padel/transitions-guard.spec.ts` | **10/10** ✅ (7.9 s) |
| E2E feature | `npx playwright test tests/e2e/transition-editor.spec.ts` | **1 passed / 1 failed** ❌ (44.2 s, 2 retries) |
| E2E regresión motor | `npx playwright test tests/e2e/puzzle-demo.spec.ts` | **2/2** ✅ (4.8 s) |

Totales del change: **861 ejecuciones automatizadas** (849 unit + 10 API + 2 E2E), 859 verdes, 1 roja por bug de UI (H-1) y 1 roja por defecto del propio spec (H-2 — la misma prueba, contada una vez).

## 2. Unit tests (Jest) — archivos del change

| Archivo | Tests | Qué cubre | AC / EC | Estado |
|---------|-------|-----------|---------|--------|
| `tests/unit/padel/transition-editor.test.ts` | 28 | Operaciones de pasos: añadir / duplicar / borrar (bloqueo del último paso) / reordenar; `setShot` y defaults de tiro; clamp de coordenadas al arrastrar; derivación de `shot` desde arco+destino; paso idéntico al anterior | AC-02, AC-06, EC-02, EC-05, EC-10 | ✅ |
| `tests/unit/padel/transition-history.test.ts` | 10 | Undo/redo por snapshots: push, undo, redo, límite 50, no-op con historial vacío, no-op con redo vacío | AC-06, EC-01 | ✅ |
| `tests/unit/padel/transition-serialization.test.ts` | 13 | Round-trip `CourtScenario → JSON → CourtScenario` sin pérdida; `Paso` con `shot: null`; `toCourtScenario` desde fila DB; `initialStepIndex` fuera de rango | AC-02, EC-08 | ✅ |
| `tests/unit/padel/transition-schemas.test.ts` | 22 | Zod: payload válido, título vacío/whitespace → error, escenario sin pasos → error, coords fuera de rango, `initialStepIndex` inválido, límites de título 200, tolerancia de campos extra | AC-05, EC-03, EC-07, EC-08, EC-10 | ✅ |
| `tests/unit/padel/court-geometry.test.ts` (MOD) | 22 | `pxToCourt` inversa de `courtToPx`; viewport 0×0 sin NaN; `clampCourtPoint` a X 0..10 / Y 0..20; ida y vuelta px↔metros | AC-06, EC-10 | ✅ |
| `tests/unit/db/transitions-queries.test.ts` | 10 | Queries de transiciones con mocks: filtro por `ownerId`, `list` paginado por cursor `updatedAt`, get by id + owner, update, delete, resultado vacío en ajeno | AC-05, EC-06 | ✅ |
| `tests/unit/padel/court-geometry` + resto de la suite `lib/padel`/`lib/padel/court` | — | Cobertura agregada del módulo: `lib/padel` **96.51 %** lines / 88.39 % branches; `lib/padel/court` **99.04 %** / 96.62 % | AC-06 | ✅ |
| `lib/db/queries/padel/transitions.ts` (cobertura) | — | **97.67 %** lines, 96.15 % branches (única línea sin cubrir: 124) | AC-05 | ✅ |

## 3. API tests (Playwright, SQL real contra DB local :5434)

### `tests/api/padel/transitions-happy.spec.ts` — 1 test

| Caso | Cubre | AC | Estado |
|------|-------|----|--------|
| `POST + GET + PUT + DELETE con auditoría y IDOR cross-coach → 404` | Ciclo CRUD completo con escritura/lectura real en `coach_transitions`; verifica `201`, listado, reemplazo completo, `204`, filas en `audit_logs` (`entity_name='coach_transition'`, create/update/delete) y `404` al tocar el recurso de otro coach | AC-05, AC-04, EC-06 | ✅ |

### `tests/api/padel/transitions-guard.spec.ts` — 9 tests

| # | Caso | Cubre | AC | Estado |
|---|------|-------|----|--------|
| 1-5 | `GET /api/transitions`, `POST /api/transitions`, `GET|PUT|DELETE /api/transitions/[id]` sin sesión → `401` | Guard de sesión en los 5 endpoints | AC-04 | ✅ |
| 6 | USER + ACTIVE en los 5 endpoints → `403` | Rol insuficiente server-side | AC-04, EC-09 | ✅ |
| 7 | ADMIN + TEMPORARY (email no verificado) en los 5 endpoints → `403` | Estado TEMPORARY bloqueado | AC-04 | ✅ |
| 8 | IDOR cross-coach: coach B no puede leer, escribir ni borrar lo de A | Ownership en GET/PUT/DELETE | AC-04/AC-05, EC-06 | ✅ |
| 9 | UUID inexistente como ADMIN → `404` (mismo código que ajeno) | Sin oráculo de existencia | AC-04, EC-06 | ✅ |

## 4. E2E tests (Playwright, viewport 375×667)

| Archivo / test | Cubre | AC | Estado |
|----------------|-------|----|--------|
| `tests/e2e/transition-editor.spec.ts:94` — "crear → probar → guardar → recargar persiste, sin scroll horizontal" | Login ADMIN → `/transiciones` → "Nueva" → título → "Añadir paso" (Paso 2 visible) → volver a Paso 1 → "Probar" (status "Reproduciendo paso N de M", auto-return) → "Guardar" → URL `/transiciones/<uuid>` → reload con título y 2 pasos persistidos. Además `scrollWidth<=375` en biblioteca y editor | AC-01, AC-03, AC-06 | ❌ **FAIL** — ver nota |
| `tests/e2e/transition-editor.spec.ts:139` — "USER en /transiciones es redirigido a /dashboard y la API responde 403" | Guard de página + guard de API para USER | AC-04, EC-09 | ✅ |
| `tests/e2e/puzzle-demo.spec.ts` (regresión, 2 tests) | Sin sesión → `/login`; usuario ACTIVE navega pasos con `aria-live` (motor Konva intacto) | AC-03 (no regresión) | ✅ |

**Nota del fallo (doble causa, ver `release-report.md` H-1/H-2):**
1. `transition-editor.spec.ts:82` — `TimeoutError: page.waitForURL "**/dashboard"` → navegó a `/admin` (login redirige ADMIN a `/admin`): **test desactualizado**, no bug.
2. Tras corregir sólo eso en copia temporal: `expect(scrollWidth).toBeLessThanOrEqual(375)` falla con **383**, causado por `button "Guardar"` (`right=383.4`): **bug real AC-01**.
3. Con ambas assertions neutralizadas, el flujo completo (crear→paso→probar→guardar→recargar persistido) **pasa**.

## 5. Cobertura por AC/EC y huecos conocidos

| Requisito | Cobertura | Hueco |
|-----------|-----------|-------|
| AC-01 | parcial (scroll horizontal automatizado; targets ≥44 px y touch-action manual) | medir 44×44 px y drag sin scroll de página |
| AC-02 | unit round-trip 13 tests | — |
| AC-03 | imports + E2E + regresión puzzle-demo | — |
| AC-04 | API 9 tests + E2E USER | no hay caso E2E de LOCKED (guard lo rechaza por `allowedStatuses:['ACTIVE']`, cubierto indirectamente por TEMPORARY) |
| AC-05 | API happy SQL real + api-docs 5 operaciones | — |
| AC-06 | unit/tsc/coverage | eslint y build delegados al harness |
| EC-11 (confirmar salida con cambios) | — | **manual** |
| EC-04 (drag no scrollea) | — | **manual** |
| `hooks/use-transitions.ts` | — | sin unit test (wiring fetch; lógica pura extraída a `lib/`) |
