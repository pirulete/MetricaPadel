# Admin Notes — Academias Ownership SUPER_ADMIN (fase @admin-engineer)

> change_id: 2026-10-03-super-admin-academy-ownership
> Rol: @admin-engineer (reanudación chunked tras cancelación previa)

## Estado

Implementación **completa** de UI SUPER_ADMIN en chunks (sin subagente unificado — prevención anti-loop).

### Chunk A — Páginas + nav
- `app/admin/layout.tsx` — links "Academias" y "Solicitudes" solo `isSuperAdmin`
- `app/admin/platform/academias/page.tsx` — `validateSuperAdmin` + `AcademyAdminTable`
- `app/admin/platform/solicitudes/page.tsx` — `validateSuperAdmin` + `AcademyRequestTable`

### Chunk B — Componentes (components/admin/platform/)
| Archivo | Rol |
|---------|-----|
| `academy-admin-table.tsx` | Tabla global (GET /api/admin/academies) + archivar/restaurar + abre modales |
| `academy-request-table.tsx` | Solicitudes (useAcademyRequests) + aprobar/rechazar + filtro pendientes |
| `academy-create-modal.tsx` | POST /api/academies (name/slug/primaryColor) |
| `transfer-ownership-modal.tsx` | GET members + POST transfer-ownership |
| `role-assign-modal.tsx` | GET members + PUT members/[userId] role |

### Chunk C — E2E + docs
- `tests/e2e/academy-super-admin.spec.ts` — spec navegable (login SA → solicitudes approve → academias tabla). **NO ejecutado por implementador** (corre @qa-release).
- Este archivo `admin-notes.md`.

## Endpoints consumidos

- `GET /api/admin/academies` — listAllAcademies (owner + memberCount + rubricCount)
- `POST /api/academies` — crear (guardSuperAdmin)
- `DELETE /api/academies/[id]` — archivar
- `POST /api/academies/[id]/restore` — desarchivar
- `POST /api/academies/[id]/transfer-ownership` — `{ targetUserId }`
- `PUT /api/academies/[id]/members/[userId]` — `{ role }`
- `GET /api/academies/[id]/members` — `{ members }` para selects
- `GET/POST /api/academy-requests` + approve/reject via `use-academy-requests`

## Patrones aplicados

- Convenciones: `.agents/patterns/admin-crud-conventions.md`
- Página server: validateSuperAdmin (patrón admins/page.tsx)
- Tabla client: user-list.tsx (loading/error/toast/busyId/reload)
- Modales: shadcn Dialog + Select + Sonner
- Hooks: useAcademyRequests + fetch directo con parseAdminError

## Verificación local

- `npx tsc --noEmit` — 0 errores
- `pnpm run lint` — 0 errores
- E2E: pendiente ejecución por @qa-release (requiere server + DB)

## Pendientes workflow

- @ponytail-reviewer
- @qa-release (E2E + smoke + test-matrix + release-report)
- @qa-validator + harness
- FEATURES.md entrada v0.9 (implementadores)
- ARCHITECTURE.md sección v0.9 (@architect)
