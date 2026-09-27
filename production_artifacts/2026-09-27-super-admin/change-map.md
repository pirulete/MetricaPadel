# Change Map — Rol SUPER_ADMIN (Super Admin de Plataforma)

> status: in-progress
> release: v0.7
> date: 2026-09-27
> change_id: super-admin-role
> module: admin+auth+api+db+ui
> tags: [roles, rbac, super-admin, security, migration, audit, ui]

## 1. Mapeo de archivos

### Fase A — DB (agente: @db-engineer)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `lib/db/schema.ts` | MOD: L4 `userRoleEnum` + `'SUPER_ADMIN'` | — | 757 (excepción schema) |
| `drizzle/0009_*.sql` | GEN: vía `pnpm run db:generate` (ALTER TYPE ADD VALUE) | schema.ts | — |
| `lib/db/queries/padel/super-admin.ts` | NEW: listAdmins, demoteUser, countActiveSuperAdmins, listAuditLogsPaginated, listAllAcademies | schema.ts | ~180 |
| `lib/padel/super-admin.ts` | NEW: assertNotLastSuperAdmin (lógica pura) | — | ~40 |
| `tests/unit/padel/super-admin.test.ts` | NEW | super-admin.ts | ~60 |

### Fase B — Auth (agente: @auth-security)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `lib/auth/admin-guard.ts` | MOD: guardAdmin/validateAdmin → isAdminRole; + guardSuperAdmin/validateSuperAdmin | role-utils | ~110 |
| `lib/auth/role-utils.ts` | MOD: ADMIN_ROLES extendido + SUPER_ADMIN_ROLES + canAssignRole restringido | — | ~45 |
| `types/auth.ts` | MOD: role `'USER' \| 'ADMIN' \| 'SUPER_ADMIN'` | — | ~20 |
| `lib/constants/navigation.ts` | MOD: getNavItems acepta SUPER_ADMIN (→ ADMIN_NAV_ITEMS) | — | ~30 |
| `lib/auth/protected-routes.ts` | MOD: promote→guardSuperAdmin; + demote/admins/audit-logs/academias; lock protege SUPER_ADMIN | — | ~520 (doc, excepción) |
| `lib/audit/super-admin.ts` | NEW: auditAdminPromoted/Demoted/SuperAdminAction | helpers | ~70 |
| `tests/unit/auth/admin-guard.test.ts` | MOD: jerarquía + estados | admin-guard | ~120 |
| `tests/unit/auth/role-utils.test.ts` | MOD: isAdminRole/canAssignRole | role-utils | ~80 |
| `tests/unit/audit/super-admin.test.ts` | NEW | audit/super-admin | ~80 |

### Fase C — Endpoints (agente: @app-engineer/@admin-engineer)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `app/api/admin/users/[id]/promote/route.ts` | MOD: guardAdmin→guardSuperAdmin + auditAdminPromoted | Fase A+B | ~55 |
| `app/api/admin/users/[id]/demote/route.ts` | NEW: POST guardSuperAdmin + protección | Fase A+B | ~70 |
| `app/api/admin/users/[id]/route.ts` | MOD: DELETE lock → isAdminRole (protege SUPER_ADMIN) | Fase B | ~195 |
| `app/api/admin/admins/route.ts` | NEW: GET guardSuperAdmin + listAdmins | Fase A+B | ~60 |
| `app/api/admin/audit-logs/route.ts` | NEW: GET guardSuperAdmin + paginación | Fase A+B | ~80 |
| `app/api/admin/academies/route.ts` | NEW: GET guardSuperAdmin + listAllAcademies | Fase A+B | ~60 |

### Fase D — UI (agente: @admin-engineer)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `app/admin/admins/page.tsx` | NEW: validateSuperAdmin + AdminsList | Fase C | ~15 |
| `app/admin/platform/page.tsx` | NEW: validateSuperAdmin + PlatformOverview | Fase C | ~15 |
| `app/admin/layout.tsx` | MOD: nav condicional (SUPER_ADMIN → links Admins/Platform) | Fase B | ~45 |
| `components/admin/super-admin/admins-list.tsx` | NEW: listar/promote/demote con estados | Fase C | ~220 |
| `components/admin/super-admin/platform-overview.tsx` | NEW: counts globales read-only | Fase C | ~120 |

### Fase E — Docs + API docs (agente: @app-engineer + @architect)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `lib/api-docs/schemas/super-admin.ts` | NEW: AdminDto, AuditLogDto, AcademyGlobalDto, pagination | Fase C | ~90 |
| `lib/api-docs/paths/super-admin.ts` | NEW: 4 endpoints (promote MOD + demote + admins + audit-logs + academias) | schemas | ~160 |
| `lib/api-docs/spec.ts` | MOD: import paths/schemas + tags | paths | 330+ |
| `lib/api-docs/schemas/padel.ts` | MOD: role enum + SUPER_ADMIN | — | ~50 |
| `FEATURES.md` | MOD: entrada super-admin-role | Fase C | — |
| `ARCHITECTURE.md` | MOD: sección v0.7 | Fase C | — |
| `.env.example` | SIN CAMBIOS (verificado: 0 env vars nuevas) | — | — |

### Fase F — Tests API + E2E (agente: @app-engineer + @qa-release)

| Archivo | Acción | Depende de | Tamaño est. |
|---------|--------|------------|-------------|
| `tests/api/admin/promote-guard.spec.ts` | NEW: ADMIN → 403 | Fase C | ~70 |
| `tests/api/admin/admins-guard.spec.ts` | NEW: 401/403 | Fase C | ~70 |
| `tests/api/admin/admins-happy.spec.ts` | NEW: SQL real | Fase C | ~80 |
| `tests/api/admin/demote-happy.spec.ts` | NEW: SQL real + protección último | Fase C | ~90 |
| `tests/api/admin/audit-logs-happy.spec.ts` | NEW: SQL real + filtros | Fase C | ~80 |
| `tests/api/admin/academies-global-happy.spec.ts` | NEW: SQL real | Fase C | ~80 |
| `tests/e2e/super-admin.spec.ts` | NEW: flujo promote/demote navegable | Fase D | ~120 |

## 2. Dependencias entre cambios

```
Fase A (DB) ──► Fase B (auth) ──► Fase C (endpoints) ──► Fase D (UI)
     │                │                    │                    │
     └────────────────┴────────────────────┴────────────────────┘
                                                                  │
                                                  Fase E (docs) ◄─┘
                                                  Fase F (tests) ◄─┘
```

- **Bloqueante**: Fase A antes de B/C (enum y queries son base). Fase B antes de C (guards).
- **Paralelizable**: Fase B y A pueden solaparse parcialmente (role-utils no depende de migración); Fase E y F corren en paralelo tras C.
- **Riesgo temprano**: verificar `ALTER TYPE ADD VALUE` en Neon al inicio de Fase A (D3) — si el migrador falla, ejecutar SQL manual + actualizar snapshot.

## 3. Orden de ejecución sugerido

1. **@db-engineer** (Fase A): schema → `db:generate` → `db:migrate` → verificar `enum_range` → queries + lógica pura → unit tests.
2. **@auth-security** (Fase B): guards, role-utils, types, lock protection, audit helpers → unit tests.
3. **@admin-engineer** (Fases C→D): endpoints (promote MOD + 4 NEW) → UI → API docs.
4. **@ponytail-reviewer**: revisión de simplicidad (helpers mínimos, sin abstracciones).
5. **@qa-release** (Fase F + cierre): tests API/E2E, test-matrix, acceptance-criteria, release-report, evidence-manifest.

## 4. Notas de tamaño

- `lib/db/schema.ts` (757 líneas): excepción permitida (schema file).
- `lib/auth/protected-routes.ts` (~520 est.): excepción documentada (tabla de referencia, no lógica).
- `lib/audit/helpers.ts` (539 líneas): **NO se toca** — los 3 helpers nuevos viven en `lib/audit/super-admin.ts` (D4) para no superar 600.
- `components/admin/super-admin/admins-list.tsx` (~220 est.): dentro de límite; si crece con estados extra, split en `admins-table.tsx` + `admins-actions.tsx`.
- `lib/db/queries/padel/super-admin.ts` (~180 est.): dentro de límite; si crece con listAuditLogsPaginated complejo, mover a `lib/db/queries/audit.ts`.