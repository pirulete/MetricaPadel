# Migration Notes — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (v0.9)

> change_id: 2026-10-03-super-admin-academy-ownership
> release: v0.9
> module: admin+academy
> date: 2026-10-03
> Rol: @db-engineer

## Migración generada

- **Archivo**: `drizzle/0011_dazzling_makkari.sql`
- **Journal**: `0011_dazzling_makkari` último entry (idx 11), orden cronológico OK
- **Contenido**: 2 enums (`academy_request_type`, `academy_request_status`) + tabla `academy_access_requests` + 5 índices (3 btree + 2 UNIQUE parciales) + **DO block data migration** (ownership → SUPER_ADMIN)

## Proceso (regla ARCHITECTURE)

1. `pnpm run db:generate` → DDL generado
2. DO block agregado al SQL generado (custom SQL)
3. Re-`pnpm run db:generate` → snapshot sincronizado ("No schema changes, nothing to migrate")
4. `_journal.json` NO editado manualmente

## Ejecución local

- **DB local**: contenedor Docker `padel-evaluation-db` (postgres:16-alpine, `localhost:5432`, db `padel_evaluation`)
- **Comando**: `set -a; source .env.local; set +a; pnpm run db:migrate`
- **Resultado**: `0010_hard_wrecker` (pendiente) + `0011_dazzling_makkari` aplicadas. DDL verificado.

## Verificación post-migración (obligatoria)

```sql
-- 1. Columnas de la tabla nueva (11/11 OK)
SELECT column_name FROM information_schema.columns WHERE table_name='academy_access_requests';

-- 2. Ownership de academias → SUPER_ADMIN (0 academias en local, OK)
SELECT id, owner_id, name FROM academies;

-- 3. Ningún OWNER activo que no sea SUPER_ADMIN (0 = OK)
SELECT count(*) FROM academy_memberships m
JOIN users u ON u.id = m.user_id
WHERE m.role='OWNER' AND m.status='active' AND u.role <> 'SUPER_ADMIN';
```

## DO block verificado end-to-end (datos temporales, luego limpiados)

Con SUPER_ADMIN + academia + membresía OWNER de coach:
- `owner_id` de academia → SUPER_ADMIN ✓
- Membresía OWNER del coach → ADMIN ✓
- Membresía OWNER activa del SUPER_ADMIN insertada ✓
- `owners_not_sa` = 0 ✓
- **Idempotente**: segunda ejecución no duplica membresías (2 filas, no 3) ✓
- **Fail-closed**: sin SUPER_ADMIN activo → `ERROR: No existe SUPER_ADMIN activo; migración de ownership abortada` ✓
- Datos temporales eliminados (DB local limpia: 0 academias, 0 membresías)

## ⚠️ Fix crítico en `scripts/migrate.ts`

**Bug**: `splitStatements` filtraba chunks que empiezan con `--` → el DO block (que lleva comentario encima) se descartaba silenciosamente. La migración 0011 reportaba "applied cleanly" con 11 statements, sin ejecutar el data migration. En producción el ownership NO se habría migrado.

**Fix aplicado**: el filtro conserva chunks con SQL real (alguna línea no-comentario) y solo descarta chunks comment-only. Verificado: 12 statements, DO block incluido.

**Nota para producción**: si la migración 0011 ya se aplicó en algún entorno con el script viejo (DO block saltado), hay que re-ejecutar el DO block manualmente o borrar el hash de `drizzle.__drizzle_migrations` y re-correr `db:migrate` (el DDL se salta como "already exists", el DO block corre).

## Estado local

- DDL aplicado y verificado (columnas OK)
- DO block NO quedó aplicado en local por diseño: la DB local no tiene SUPER_ADMIN activo → fail-closed (EXCEPTION). En producción (donde existe SUPER_ADMIN) correrá al aplicar la migración.
- Unit tests: 308/308 pasan (db + padel), typecheck 0 errores, lint 0 errores.