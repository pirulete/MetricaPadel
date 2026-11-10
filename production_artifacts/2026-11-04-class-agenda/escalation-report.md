# Escalation Report — HIGH risk (Agenda de clases por curso)

> change_id: 2026-11-04-class-agenda
> risk_level: HIGH (migración DDL nueva + schema.ts/_journal + registro de guards auth)
> fecha: 2026-11-04

## Por qué HIGH

- Migración **`0013_spotty_felicia_hardy.sql`**: 2 enums (`class_block_status`, `block_enrollment_status`) + 3 tablas nuevas (`weekly_slots`, `class_blocks`, `block_enrollments`) + índices (incl. UNIQUE parcial de materialización) + FKs (course set-null, users no action) — el patrón `/drizzle\/|schema\.ts|_journal\.json|\.sql$/` de `lib/policy/risk-rules.js` clasifica el cambio como HIGH.
- `lib/db/schema.ts` y `drizzle/meta/_journal.json` modificados (orden del journal verificado = índice 13).
- `lib/auth/protected-routes.ts` modificado (+15 rutas de agenda con `guard`/`allowedStatuses`/`roles`/`antiIdor`/`audit`) — registro de gates, sin tocar `auth.ts` ni `admin-guard.ts`.
- DDL puro: **sin data migration** (cero DO blocks, cero filas existentes afectadas); rollback = `DROP TABLE` de las 3 tablas en orden inverso (sin FKs entrantes).

## Qué se verificó localmente

| Gate | Estado |
|------|--------|
| typecheck | pass (`npx tsc --noEmit`, 0 errores) |
| lint | pass (0 errores; warnings: preexistentes + `protected-routes.ts` 665 L con excepción de registro documentada en ponytail) |
| unit_tests | pass (**948** totales; ~90+ de la feature: class-agenda 50, validations, agenda notifications 32, uuid v5, db smoke) |
| api_tests | pass (7: happy-path coach con SQL real + guards 401/403/404/409 + happy alumno con cursor B2) |
| e2e | pass (2 `class-agenda.spec.ts` móvil 375×667 + 6 de regresión: transition-editor, puzzle-demo, transition-fab) |
| build | pass (`next build` con las rutas de agenda) |
| secrets / sast | pass (gitleaks + semgrep en la corrida del harness) |
| migrations | `0013` aplicada localmente (:5434); verificada con `information_schema` (3 tablas/columnas), `pg_indexes` (8 índices + UNIQUE parcial) y `pg_constraint` (5 FKs con onDelete) |
| features/docs/artifacts | pass (FEATURES entry v0.11, ARCHITECTURE sección v0.11, 19/19 artifacts) |
| coverage | pass (unit nuevos cubren `lib/padel/class-agenda.ts`, `agenda-group-id`, `validations/class-agenda`, `notifications/agenda`; sin regresión) |

## Qué queda para producción / entorno con DB completa

1. **`pnpm run db:migrate` en el deploy** creará las 3 tablas (verificación post-migración):
   ```sql
   SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename IN ('weekly_slots','class_blocks','block_enrollments');
   SELECT indexname FROM pg_indexes WHERE tablename IN ('weekly_slots','class_blocks','block_enrollments');
   SELECT conrelid::regclass, confdeltype FROM pg_constraint WHERE conrelid IN ('class_blocks'::regclass,'block_enrollments'::regclass);
   ```
   Esperado: 3 tablas, 8+ índices, FK `class_blocks.weekly_slot_id` con `confdeltype='n'` (set null) y `block_enrollments.student_id` con `'a'` (no action).
2. **Recordatorio automático — STANDBY** (decisión del usuario): v1 sin cron. Para activarlo (calcado de StreetMove): crear `.github/workflows/cron-external.yml` con `schedule: '*/30 * * * *'` + `workflow_dispatch` que llame a `POST /api/cron/class-reminders` (pendiente de crear ese endpoint + `CRON_SECRET`), y dejar `vercel.json` con `crns: []`. Sin migración.
3. **Checks manuales del release**: M-01 notificación push visible en dispositivo real; M-02 responsive en hardware 375px (el E2E cubre el layout con viewport simulado).

## Hallazgos conocidos NO originados por este change

- **BUG-01 preexistente**: `app/(app)/cursos/[id]` desborda horizontalmente a 375 px en todas sus tabs (detectado al correr el E2E nuevo; el flujo de la feature pasa — el overflow es del layout base de detalle de curso). Ver `92-improvement-notes.md`.
- **`lib/date-utils.ts`**: código muerto de StreetMove que hardcodea `America/Santiago` e ignora `APP_TIMEZONE` — fuera de alcance (D18); el "hoy" de esta feature usa `todayInTimeZone(APP_TIMEZONE ?? 'UTC', now)`.

## Datos del riesgo en el harness

- `evidence-manifest.json.risk_level = "HIGH"` (coincide con `risk_policy` sobre los archivos cambiados: drizzle/schema/journal).
- El `completion_claim` exige para HIGH el presente report (regla de `lib/modules/harness/evidence.js`); precedentes: `2026-10-03-super-admin-academy-ownership` y `2026-11-02-coach-transition-editor`.
