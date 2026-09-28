# App Notes — G16 Soft-delete de Evaluaciones

> change_id: evaluation-soft-delete
> module: dashboard
> date: 2026-09-28
> release: v0.7
> status: released

## Qué se implementó

Soft-delete (archivado) de evaluaciones en Métrica Pádel: el coach retira una
evaluación publicada errónea sin borrarla permanentemente. Los datos se
conservan (historial + versiones); las queries de coach/alumno la ocultan vía
`deletedAt`.

## Decisiones técnicas

- **Columna `deletedAt`** en `evaluations` (mismo patrón que `notifications.deletedAt`).
  Migración `0010_hard_wrecker.sql` generada con `pnpm run db:generate`.
- **Helper reusable `isNotDeleted = isNull(evaluations.deletedAt)`** exportado desde
  `lib/db/queries/padel/evaluations.ts` y reutilizado en `history.ts`.
- **Alcance del filtro**: todas las queries de coach/alumno (detalle, listas,
  series, evolución, save, publish, mark-read, historial). Las queries de
  admin/super-admin NO filtran (el super admin ve todo).
- **Versiones intactas**: el cómputo `MAX(version)+1` en `publishEvaluation` NO
  excluye archivadas → no se reutilizan números de versión tras archivar.
- **Endpoint `DELETE /api/evaluations/[id]`**: `guardAdmin` + anti-IDOR (404 si no
  pertenece al teacher) + `auditDelete` + `{ success: true }`. DELETE repetido → 404.
- **PUT/publish sobre archivada → 404** (las queries de mutación filtran deleted).

## Archivos

| Archivo | Acción |
|---------|--------|
| `lib/db/schema.ts` | 🔧 `evaluations.deletedAt` |
| `drizzle/0010_hard_wrecker.sql` | ➕ migración |
| `lib/db/queries/padel/evaluations.ts` | 🔧 `isNotDeleted` + filtros |
| `lib/db/queries/padel/history.ts` | 🔧 filtro deleted |
| `app/api/evaluations/[id]/route.ts` | 🔧 handler DELETE |
| `lib/api-docs/paths/padel.ts` | 🔧 docs DELETE |
| `tests/api/padel/evaluation-delete.spec.ts` | ➕ guards + happy-path SQL real |
| `tests/unit/db/evaluations.test.ts` | 🔧 tests G16 |

## Tests

- Unit: 11 tests G16 en `tests/unit/db/evaluations.test.ts` (566 total passing).
- API: `tests/api/padel/evaluation-delete.spec.ts` — 401/403/404 + happy-path SQL real.
  El happy-path requiere NeonDB real (en este entorno solo corrió el guard 401;
  el patrón es idéntico a `evaluations-happy.spec.ts`).
- `npx tsc --noEmit` limpio; lint 0 errores en archivos tocados.

## Pendiente / Notas

- El happy-path API test requiere `DATABASE_URL` real (Neon) — corre en CI/harness.
- No se agregó UI de "Archivar" en el frontend (fuera de alcance de G16; el
  endpoint queda listo para el wiring).