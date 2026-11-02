# Escalation Report — HIGH risk (Editor de Transiciones del coach)

> change_id: 2026-11-02-coach-transition-editor
> risk_level: HIGH (migración DDL nueva + schema.ts + contratos API con auth/auditoría)
> fecha: 2026-11-02

## Por qué HIGH

- Migración **`0012_young_betty_ross.sql`** (tabla nueva `coach_transitions` + índice `coach_transitions_owner_updated_idx`) — el patrón `/drizzle\/|schema\.ts|_journal\.json|\.sql$/` de `lib/policy/risk-rules.js` clasifica estos cambios como HIGH.
- `lib/db/schema.ts` y `drizzle/meta/_journal.json` modificados (aditivo; orden del journal verificado = índice 12).
- Nueva superficie API con autorización y auditoría: 5 endpoints `/api/transitions*` con `guardAdmin`, `audit_logs` en las 3 mutaciones y anti-IDOR 404 (la migración de datos NO toca filas existentes — DDL puro, sin DO blocks).
- Nota: el diff local vs `main` incluye además la migración **`0011_dazzling_makkari`** (feature super-admin aún sin releasar en `main`), lo que contribuye al riesgo agregado del branch.

## Qué se verificó localmente

| Gate | Estado |
|------|--------|
| typecheck | pass (`npx tsc --noEmit`, 0 errores) |
| lint | pass (0 errores; 254 warnings preexistentes/patrón de tests) |
| unit_tests | pass (849 totales; 95+ de la feature) |
| api_tests | pass (10: transitions-happy SQL real + transitions-guard 401/403/404) |
| e2e | pass (transition-editor 2/2 con viewport 375×667 sin scroll horizontal; regresión puzzle-demo 2/2) |
| build | pass (3 rutas `/transiciones*` compiladas) |
| secrets | pass (gitleaks en la corrida del harness) |
| sast | pass (semgrep en la corrida del harness) |
| migrations | `0012` aplicada localmente (Postgres 5434); 6/6 columnas + índice + FK verificados con `information_schema`/`pg_indexes` |
| features/docs/artifacts | pass (FEATURES.md, ARCHITECTURE.md, 17/17 artifacts) |
| coverage | pass (`lib/padel` 96.51%, `transitions.ts` 97.67% — sin regresión del módulo) |

## Qué queda para producción / entorno con DB completa

1. **`pnpm run db:migrate` en el deploy** creará `coach_transitions` (verificación post-migración):
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'coach_transitions';
   SELECT indexname FROM pg_indexes WHERE tablename = 'coach_transitions';
   SELECT condeltype FROM pg_constraint WHERE conrelid = 'coach_transitions'::regclass AND confrelid = 'users'::regclass;
   ```
   Esperado: 6 columnas, índice `coach_transitions_owner_updated_idx`, FK sin cascade (`confdeltype = 'a'`).
2. La data migration NO aplica (DDL puro) — cero filas existentes afectadas; rollback: `DROP TABLE coach_transitions`.
3. Los tests API/E2E de la feature usan `DATABASE_URL` con `override:false` de dotenv — en Vercel/CI usar el `DATABASE_URL` del scope correspondiente.

## Datos del riesgo en el harness

- `evidence-manifest.json.risk_level = "HIGH"` (coincide con `risk_policy` del harness sobre los archivos cambiados).
- `completion_claim` exige para HIGH el presente report (regla de `lib/modules/harness/evidence.js`); precedente: `production_artifacts/2026-10-03-super-admin-academy-ownership/escalation-report.md`.
