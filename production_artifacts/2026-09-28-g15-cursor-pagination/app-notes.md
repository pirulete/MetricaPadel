# App Notes — G15 Paginación por cursor (2026-09-28)

> change_id: g15-cursor-pagination-2026-09-28
> module: dashboard
> release: v0.8
> tags: [pagination, cursor, api, ui, queries]

## Qué se implementó

Paginación por cursor en los 5 listados de Métrica Pádel (`listEvaluations`, `listStudentEvaluations`, `listHistory`, `listRubrics`, `listCourses`) reutilizando el patrón exacto de `getNotificationsByUserId` (limit+1 → hasMore → nextCursor ISO).

## Decisiones técnicas

- **Tipos compartidos** en `lib/db/queries/padel/pagination.ts` (`PaginationParams`, `PaginatedResult<T>`, `resolveLimit` default 20 / máx 50) — evita duplicar el patrón en 5 archivos.
- **Cursor = campo de orden**: a diferencia del template genérico (createdAt), cada query usa su propio campo de orden como cursor (`updatedAt` en listEvaluations, `publishedAt` en student/history, `createdAt` en rubrics/courses). Si se usara createdAt con orderBy updatedAt, la paginación saltaría/duplicaría items. Documentado en FEATURES.md.
- **`listCoursesForDashboard`**: query separada sin paginar para `getTeacherDashboard` (métricas `classesToday` + lista home necesitan array completo). El endpoint `/api/courses` queda paginado.
- **Breaking change de respuesta**: los 5 GET ahora retornan `{ items, nextCursor }` en vez de `{ evaluations }`/`{ rubrics }`/`{ courses }`. Se actualizaron todos los consumidores UI (history-list, rubric-library, assign-rubric-modal, scoring-canvas, pair-scoring-canvas, cursos, evaluaciones) y 8 specs API existentes.
- **cursos/page.tsx**: la rama ADMIN pasó de `/api/dashboard/teacher` a `/api/courses` (paginado) para la detección de rol + lista. El alumno sigue con `/api/dashboard/student` (sin paginar, fuera de alcance).
- **Edge case historial**: borradores con `publishedAt` null quedan en la página 1 (DESC pone NULLs primero) y no generan cursor — no hay pérdida de datos.

## Archivos

- Nuevos: `lib/db/queries/padel/pagination.ts`, `tests/unit/db/courses.test.ts`, `tests/unit/db/history.test.ts`, `tests/api/padel/pagination-happy.spec.ts`.
- Modificados: 5 queries padel, dashboard.ts, 5 route handlers, 4 componentes UI + 3 consumidores shape, `lib/validations/padel.ts`, `lib/api-docs/paths/{padel,courses}.ts`, 8 specs API, 2 unit tests.

## Validación

- `npx tsc --noEmit`: 0 errores.
- `pnpm run test:unit`: 627 tests pasan (49 suites).
- API tests parsean (`--list`); happy-path de paginación requiere servidor + DB (skip graceful sin `DATABASE_URL`).
- Lint: 2 errores pre-existentes en `scripts/loop-metrics.js` (no tocados).

## Pendiente

- Correr `tests/api/padel/pagination-happy.spec.ts` con servidor dev + Postgres local para validar SQL real.
- E2E de "Cargar más" si se requiere cobertura navegable (los 4 componentes son client; el patrón es idéntico al de notifications).