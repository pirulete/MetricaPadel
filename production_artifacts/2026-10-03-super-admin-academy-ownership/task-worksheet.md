# Task Worksheet — Academias Ownership SUPER_ADMIN (reanudación admin)

## 1. Identidad

| Campo | Valor |
|---|---|
| Change ID | `2026-10-03-super-admin-academy-ownership` |
| Workflow | `/ship-feature` |
| Fecha inicio | 2026-10-03 |
| Última actualización | 2026-10-03 |
| Estado | `done` (gates locales pass; API/E2E prod pendientes — ver escalation-report.md) |

## 2. Objetivo

Completar la fase **@admin-engineer** (UI SUPER_ADMIN) de la feature academias ownership + solicitudes, tras cancelación previa por loop/recursos. Implementar en chunks ≤5 archivos.

## 3. Archivos afectados (fase admin pendiente)

| Archivo | Rol | Estado |
|---|---|---|
| `app/admin/platform/academias/page.tsx` | Página SA academias | **pendiente** |
| `app/admin/platform/solicitudes/page.tsx` | Página SA solicitudes | **pendiente** |
| `app/admin/layout.tsx` | Nav links SA | **pendiente** |
| `components/admin/platform/academy-admin-table.tsx` | Tabla academias | **pendiente** |
| `components/admin/platform/academy-request-table.tsx` | Tabla solicitudes | **pendiente** |
| `components/admin/platform/academy-create-modal.tsx` | Modal crear | **pendiente** |
| `components/admin/platform/transfer-ownership-modal.tsx` | Modal transfer | **pendiente** |
| `components/admin/platform/role-assign-modal.tsx` | Modal rol | **pendiente** |
| `tests/e2e/academy-super-admin.spec.ts` | E2E spec (solo escribir) | **pendiente** |
| `production_artifacts/.../admin-notes.md` | Artifact | **pendiente** |

## 4. Qué se hizo (para no repetir)

- [x] @pm feature-spec + release-scope
- [x] @architect technical-design + change-map
- [x] Cross-agent review → VIABLE (app-notes.md)
- [x] @db-engineer: schema + migración 0011 + queries + unit db
- [x] @auth-security: guardSuperAdminOrAcademy* + lib/audit/academy.ts
- [x] @app-engineer: API 9 endpoints + hooks + UI coach + API docs + tests
- [x] Lint fix: scripts/loop-metrics.js eslint-disable
- [x] Prevenciones anti-loop: ship-feature.md, admin/app-engineer.md, AGENTS.md, admin-crud-conventions.md
- [x] Task cancelada por runtime (admin-engineer unificado) — causa: prompt masivo sin chunking

## 5. Qué queda (chunks)

- [x] **Chunk A**: `academias/page.tsx` + `solicitudes/page.tsx` + `layout.tsx` MOD
- [x] **Chunk B1**: `academy-admin-table.tsx` + `academy-request-table.tsx`
- [x] **Chunk B2**: `academy-create-modal.tsx` + `transfer-ownership-modal.tsx` + `role-assign-modal.tsx`
- [x] **Chunk C**: E2E spec (NO ejecutar) + `admin-notes.md`
- [ ] @ponytail-reviewer → @qa-release → harness

## 6. Bloqueadores

| Bloqueador | Impacto | Decisión |
|---|---|---|
| DB local sin SUPER_ADMIN activo | DO block migración no aplicado local | OK — fail-closed, corre en prod |
| 3 fallos API promote pre-existentes | No relacionados con feature | Documentar en test-matrix |

## 7. Cómo validar

- [ ] `npx tsc --noEmit`
- [ ] `pnpm run lint`
- [ ] `pnpm run test:unit`
- [ ] E2E por @qa-release (no por implementador)
- [ ] evidence-manifest.json al cierre

## 8. Notas de contexto

- Hooks: `use-academy-requests.ts` (list/approve/reject/available), `use-academies.ts` (transfer/assign/restore)
- Convenciones: `.agents/patterns/admin-crud-conventions.md`
- Endpoints y guards: `production_artifacts/.../technical-design.md` §4 + app-notes.md
- Patrón página: `app/admin/admins/page.tsx` + `components/admin/users/user-list.tsx`
- Prohibido a implementadores: build/playwright/db:migrate
