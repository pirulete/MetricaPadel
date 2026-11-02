# Release Report — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> module: admin+academy
> Fecha validación: 2026-10-04
> Validador: @qa-release

## Resumen

Feature v0.9: centraliza el ownership de academias en SUPER_ADMIN, introduce solicitudes de acceso (join/create) con aprobación/rechazo, transferencia de ownership, asignación de roles y unarchive. Implementación completa (DB + guards + 9 endpoints + UI coach + UI admin SA + tests).

## AC Status

- **PASS**: 10/11 (AC-01 a AC-10)
- **PARTIAL**: 1/11 (AC-11 — tests escritos; ejecución E2E/API bloqueada sin servidor)
- **FAIL**: 0
- Detalle: `acceptance-criteria.md`

## Gate results locales

| Gate | Resultado |
|------|-----------|
| `npx tsc --noEmit` | ✅ 0 errores |
| `pnpm run lint` | ✅ 0 errores (248 warnings pre-existentes) |
| `pnpm run test:unit` (patrón academy) | ✅ 123/123 PASS (9 suites) |
| E2E `academy-super-admin.spec.ts` | ⏸️ BLOCKED — sin servidor `next dev` |
| API tests (6 specs academy) | ⏸️ BLOCKED — sin servidor + DB |
| Harness `validate-harness.js` | No ejecutado (responsabilidad del orquestador) |

## Bugs encontrados

| Severidad | Bug | Estado |
|-----------|-----|--------|
| N/A | Ningún bug nuevo detectado en verificación estática (guards, endpoints, migración, docs) | — |
| ⚠️ Pre-existente | 3 fallos en `promote.spec.ts`/`promote-happy.spec.ts` (403 vs 404) | NO relacionado con v0.9; requiere triage separado |

## Smoke / regresión

- **Patrón guards**: `guardSuperAdminOrAcademyRole` (academy-guard.ts:122-145) respeta sessionGate primero (LOCKED/TEMPORARY → 403 incluso SA), path SA verifica existencia de academia (404 anti-IDOR, permite archivadas), path no-SA delega en guardAcademyRole existente. No rompe guards previos (suite auth 96 tests según auth-impact).
- **API docs**: `lib/api-docs/spec.ts` wired con `academyRequestsPaths/Tags/Schemas` (líneas 17-18, 326-330). Paths nuevos documentados: `/api/academy-requests`, `/{id}/approve`, `/{id}/reject`, `/available-academies`, `/api/academies/{id}/transfer-ownership`, `/restore`, PUT `members/{userId}`.
- **Migración**: `0011_dazzling_makkari.sql` con DO block idempotente + fail-closed (RAISE EXCEPTION sin SUPER_ADMIN activo). Verificación post-migración pendiente en runtime (BLOCKED).
- **Rate limit**: `ACADEMY_REQUEST_MAX`/`ACADEMY_REQUEST_WINDOW_MS` creados en `lib/rate-limit.ts` (patrón invite), aplicado antes del guard en POST /api/academy-requests.

## Pendientes para aprobar release

1. **Ejecutar E2E** `tests/e2e/academy-super-admin.spec.ts` con servidor + DATABASE_URL (orquestador).
2. **Ejecutar API tests** academy (6 specs) con servidor + DB — validar happy-path SQL real.
3. **Verificar migración en DB**: `SELECT owner_id FROM academies` + `SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> sa_id` = 0.
4. **Triage** de los 3 fallos promote pre-existentes (no bloqueante para v0.9).
5. **FEATURES.md** entrada v0.9 + **ARCHITECTURE.md** sección v0.9 (pendientes de implementadores/@architect).
6. Harness `--all` por el orquestador antes de merge a rama-preview.

## Veredicto

**CONDITIONAL PASS** — código y tests estáticos verificados (tsc/lint/unit OK, AC 10/11 PASS). Bloqueado únicamente por falta de runtime (servidor+DB) para E2E/API happy-path; no aprobar release final hasta ejecutar esos gates.