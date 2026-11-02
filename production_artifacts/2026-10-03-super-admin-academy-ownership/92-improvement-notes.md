# Improvement Notes — 2026-10-03-super-admin-academy-ownership

> Validador: @qa-validator — 2026-10-05

## Observaciones (no bloqueantes)

1. **API + E2E BLOCKED (AC-11 PARTIAL)**: 6 specs API (34 tests) y 1 E2E escritos pero sin ejecutar — requieren servidor `next dev` + `DATABASE_URL`. El orquestador debe ejecutarlos antes del release final.
2. **3 fallos pre-existentes en `promote.spec.ts`/`promote-happy.spec.ts`** (403 vs 404): NO relacionados con v0.9; requieren triage separado.
3. **Migración 0011 DO block fail-closed**: aplicación pendiente en prod. Verificar post-migración: `SELECT owner_id FROM academies` y `SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> sa_id` = 0.
4. **Cobertura global Jest** (33.53% en run parcial vs umbral 40%): es umbral global, no regresión de módulo; verificar con harness `--coverage`.
5. **Build/secrets/sast no re-ejecutados** por @qa-release en este ciclo — marcados skipped en gate results; el harness `--all` del orquestador debe confirmarlos.