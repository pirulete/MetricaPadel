# Escalation Report — HIGH risk (academias ownership SUPER_ADMIN)

> change_id: 2026-10-03-super-admin-academy-ownership
> risk_level: HIGH (migración de datos + auth/RBAC + contratos API)
> fecha: 2026-10-03

## Por qué HIGH

- Migración `0011_dazzling_makkari` reasigna ownership de academias existentes (data migration en DO block).
- Cambio de guard: `POST /api/academies` de `guardAdmin` → `guardSuperAdmin` (breaking para ADMIN global).
- Nuevos guards compuestos y endpoints de transferencia de ownership / solicitudes.

## Qué se verificó localmente

| Gate | Estado |
|------|--------|
| typecheck | pass (`npx tsc --noEmit`) |
| lint | pass (0 errores) |
| unit_tests | pass (712 totales; 123+ de la feature) |
| build | pass (`npx next build` con DATABASE_URL de .env.local) |
| secrets | pass (gitleaks previo) |
| features/docs/artifacts | pass |
| Migración DDL | aplicada localmente; columnas verificadas |

## Qué queda para producción / entorno con DB completa

1. **DO block data migration**: fail-closed sin SUPER_ADMIN activo; ejecutará en prod al correr `db:migrate`. Verificar post-migración:
   ```sql
   SELECT owner_id FROM academies;
   SELECT count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> '<sa_id>';
   ```
2. **API tests happy-path/guards** y **E2E** `academy-super-admin.spec.ts`: requieren servidor + DB en runtime Playwright. Specs escritos; ejecutar en CI o máquina con `DATABASE_URL`.
3. **3 fallos API promote pre-existentes**: no relacionados con esta feature (documentado en test-matrix).

## Decisión

Se permite completion claim para la fase de desarrollo en `rama-preview` con los gates locales en pass. El deploy a producción (vía `/supercommitpro`) no debe ejecutarse hasta correr API/E2E contra DB real y confirmar la migración 0011.

## Acciones del humano

- [ ] Correr `npx playwright test tests/api/padel/academy-* tests/e2e/academy-super-admin.spec.ts` con DB
- [ ] Confirmar DO block en producción
- [ ] Revisar 3 fallos promote (bug real vs test desactualizado)
