# Ponytail Review — 2026-10-03-super-admin-academy-ownership

Fase: admin UI (SUPER_ADMIN academias + solicitudes). Escalera Ponytail aplicada. Sin cambios de acceptance criteria.

## Archivos revisados

| Archivo | Líneas (antes → después) | Veredicto |
|---------|--------------------------|-----------|
| `components/admin/platform/academy-admin-table.tsx` | 202 → 192 | Refactor parcial |
| `components/admin/platform/academy-create-modal.tsx` | 107 | Mínimo, OK |
| `components/admin/platform/academy-request-table.tsx` | 180 → 177 | Refactor parcial |
| `components/admin/platform/role-assign-modal.tsx` | 135 | Mínimo, OK |
| `components/admin/platform/transfer-ownership-modal.tsx` | 119 | Mínimo, OK |
| `app/admin/platform/academias/page.tsx` | 18 | Mínimo, OK |
| `app/admin/platform/solicitudes/page.tsx` | 18 | Mínimo, OK |
| `app/admin/layout.tsx` | 50 | Diff nav mínimo, OK |
| `components/padel/academy-request-form.tsx` | 222 | Mínimo (2 tabs = AC), OK |
| `hooks/use-academy-requests.ts` | 146 → 129 | Refactor (borrado) |
| `hooks/use-academies.ts` | 237 → 190 | Refactor (borrado) |
| `lib/padel/academy-requests.ts` | 73 | Puro y mínimo, OK |
| `app/api/academy-requests/route.ts` | 130 | Skim: Zod+guards+audit, OK |
| `app/api/academy-requests/[id]/{approve,reject}/route.ts`, `available-academies/route.ts` | 24–115 | Skim: patrón estándar, OK |
| `app/api/academies/transfer-ownership/route.ts`, `[id]/restore/route.ts` | 53+ | Skim: patrón estándar, OK |

## Simplificaciones aplicadas (net negative)

1. **YAGNI — `hooks/use-academy-requests.ts`**: eliminado `listRequests` (callback duplicado de `reload` con mismos params; cero call sites en UI o tests). −17 líneas.
2. **YAGNI — `hooks/use-academies.ts`**: eliminados `assignRole`, `transferOwnership`, `restore` (añadidos por v0.9 pero la UI admin hace fetch inline contra `/api/admin/academies` + modales; cero call sites). −47 líneas.
3. **Plataforma nativa — `academy-request-table.tsx`**: eliminado filtro client-side redundante `visible` (el server ya filtra con `?status=pending`); el estado `requests` es la fuente única. −2 líneas.
4. **Micro-fix — `academy-admin-table.tsx`**: eliminado `disabled={busyId === row.id}` muerto en botones Roles/Transferir (`busyId` solo se setea en archive/restore; esos botones abren modales). −8 líneas.
5. **Lint — `academy-request-table.tsx`**: eliminado import muerto `parseAdminError` (warning ESLint pre-existente). −1 línea.

**Net: −77 líneas** (sin agregar código nuevo).

## Excepciones / evaluado y mantenido

- **MemberRow + efecto de load-members duplicado** en `role-assign-modal` y `transfer-ownership-modal` (~20 líneas c/u): extraer un hook compartido *añadiría* abstracción; regla Ponytail = preferir borrar sobre añadir. Duplicación aceptada entre 2 modales disjuntos.
- **`SLUG_REGEX`/`HEX_REGEX` duplicados** en `academy-create-modal` y `academy-request-form`: módulo compartido de 2 regexes es YAGNI. Se mantienen locales.
- **Superficie muerta v0.6 pre-existente** en `use-academies` (`create`/`update`/`archive`/`uploadLogo`/`invite`/`accept`/`removeMember` también sin call sites tras la migración a fetch inline en `academy-form`/`logo-upload`/`invite-member-modal`): fuera del alcance de esta feature; candidato a borrado en un cleanup dedicado.
- **Ningún archivo >500 líneas** tras refactor → sin split.
- **API routes + `lib/padel/academy-requests.ts`**: ya mínimos (Zod + guards + audit helpers); sin wrappers ni abstracciones que borrar.

## Verificación

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre los 4 archivos tocados → 0 errores (1 warning pre-existente eliminado).
- Tests: no se eliminó lógica con call sites; unit tests de queries/schemas intactos (`transferOwnership` de DB y Zod schemas NO se tocaron — solo helpers de hook UI muertos).
