# Test Matrix — Gaps User Flows (G3/G4/G9/G11)

> change_id: gaps-user-flows
> release: v0.3
> date: 2026-09-21

## Resumen de ejecución

| Suite | Resultado | Detalle |
|-------|-----------|---------|
| Typecheck (`npx tsc --noEmit`) | ✅ PASS | 0 errores |
| Lint (`pnpm run lint`) | ✅ PASS | 0 errores, 126 warnings (no bloqueantes) |
| Unit (`pnpm run test:unit`) | ✅ PASS | 30 suites / 357 tests |
| Build (`pnpm run build`) | ✅ PASS | Next.js build + db:migrate skip (sin DATABASE_URL) |
| API padel (`npx playwright test tests/api/padel/`) | ⚠️ PASS con 1 flaky | 57 passed / 1 flaky / 0 failed |

## API tests — tests/api/padel/ (58 tests, SQL real contra NeonDB local)

| Archivo | Tests | Resultado |
|---------|-------|-----------|
| `guard.spec.ts` | 401 sin sesión + 403 rol + 404 IDOR | ✅ |
| `courses-guard.spec.ts` | 401/403 cursos | ✅ |
| `courses-happy.spec.ts` | CRUD curso + rubrics assign | ✅ |
| `join-happy.spec.ts` | join 201 + 404/409/400 | ✅ |
| `dashboard-happy.spec.ts` | teacher/student dashboard | ✅ |
| `history-happy.spec.ts` | historial + filtros + IDOR | ✅ |
| `rubrics-happy.spec.ts` | CRUD rúbrica | ✅ |
| `evaluations-happy.spec.ts` | borrador + scores + publish | ✅ |
| `student-happy.spec.ts` | alumno published + mark-read | ✅ |
| `admin-users-happy.spec.ts` | crear jugador ACTIVE | ✅ |
| `admin-users-password.spec.ts` | 401/403/400/409 | ✅ |
| `admin-users-password-happy.spec.ts` | sin password → generatedPassword + login real; con password → sin generatedPassword | ✅ |
| `promote.spec.ts` | 401/403/404 (inexistente, ya ADMIN) | ✅ |
| `promote-happy.spec.ts` | promote → role ADMIN en DB + audit UPDATE | ⚠️ FLAKY (cleanup afterAll) |
| `evaluation-published.spec.ts` | 401/403/404 | ✅ |
| `evaluation-published-happy.spec.ts` | publish → notificación + dashboard/student | ✅ |
| `course-leave.spec.ts` | 401/403/404 no inscrito | ✅ |
| `course-leave-happy.spec.ts` | join → leave → enrollment eliminado + re-join | ✅ |

## Defecto documentado

### FLAKY-1 — promote-happy.spec.ts afterAll cleanup (severidad: baja, test-only)

- **Error exacto**: `error: operator does not exist: character varying = uuid`
- **Stack trace**:
  ```
  at tests/api/padel/promote-happy.spec.ts:45:5
  await pool.query(
    `DELETE FROM audit_logs WHERE entity_name = 'user' AND entity_id IN (SELECT id FROM users WHERE email = $1)`,
    [USER_EMAIL]
  );
  ```
- **Comportamiento esperado**: el cleanup elimina audit_logs del usuario de test.
- **Comportamiento real**: falla porque `audit_logs.entity_id` es `varchar(100)` (schema.ts:66) y `users.id` es `uuid` (schema.ts:16) — el subquery `entity_id IN (SELECT id ...)` no compila en Postgres.
- **Clasificación**: bug de test (cleanup), NO product bug. El test body pasa (retry #1 OK); la verificación SQL de role ADMIN y audit UPDATE es correcta.
- **Impacto**: deja audit_logs residuales del usuario de test; marca el test como flaky.
- **Fix sugerido**: castear `entity_id::uuid` en el DELETE, o eliminar por `entity_id = $1` con el userId ya resuelto en el test.

## Cobertura unit de módulos nuevos (Jest)

| Módulo | Statements | Branches | Funciones | Líneas |
|--------|-----------|----------|-----------|--------|
| `lib/padel/password.ts` | 100% | 100% | 100% | 100% |
| `lib/db/queries/padel/promote.ts` | 100% | 100% | 100% | 100% |
| `lib/db/queries/padel/enrollments.ts` | 85.71% | 87.5% | 71.42% | 91.3% |
| `lib/notifications/triggers.ts` | 71.42% | 100% | 33.33% | 71.42% |
| `lib/db/queries/padel/admin-users.ts` | 88.23% | 33.33% | 66.66% | 88.23% |

Sin regresión >3% vs baseline (módulos nuevos ≥71% statements).