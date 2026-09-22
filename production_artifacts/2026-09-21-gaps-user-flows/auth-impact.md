# Auth Impact — Gaps User Flows (G3, G4, G11)

> change_id: gaps-user-flows
> module: auth
> date: 2026-09-21
> release: v0.3
> status: in-progress

## Resumen

3 de los 4 gaps tocan autenticación/autorización. **No se modifican guards existentes** (`guardAdmin`/`guardUser` reutilizados); se añaden 2 entradas de referencia en `lib/auth/protected-routes.ts` y se verifican los controles de seguridad del diseño contra el código actual.

## Guard server-side verificado

| Endpoint | Guard | Estados | Roles | Verificación |
|----------|-------|---------|-------|--------------|
| `POST /api/admin/users/[id]/promote` | `guardAdmin` | ACTIVE | ADMIN | `guardAdmin` en `lib/auth/admin-guard.ts` → 401 sin sesión, 403 si role≠ADMIN o status≠ACTIVE |
| `DELETE /api/courses/[id]/enrollment` | `guardUser` + ACTIVE + role USER | ACTIVE | USER | Mismo patrón que `POST /api/courses/join` (route.ts:20-26): guardUser → 401, status≠ACTIVE → 403, role≠USER → 403 |

Ambas rutas quedan documentadas en `lib/auth/protected-routes.ts` (referencia, no middleware automático — consistente con la convención del proyecto).

## 403 en endpoints protegidos

- **Promote**: USER autenticado → 403 (`guardAdmin`). Sin sesión → 401.
- **Enrollment DELETE**: ADMIN/coach autenticado → 403 (check `role !== "USER"` explícito en route, igual que join). Sin sesión → 401. LOCKED → 403 (`guardUser`).

## Auditoría configurada

| Endpoint | Evento | Entidad | Detalle |
|----------|--------|---------|---------|
| Promote | `auditUpdate` | `user` | `{ role: "USER" } → { role: "ADMIN" }`, `userId: adminId` |
| Enrollment DELETE | `auditDelete` | `course_enrollment` | `{ courseId, studentId }`, `userId: studentId` |
| Admin users POST (G4) | `auditCreate` (existente) | `user` | Solo `email/firstName/lastName/role/status` — **sin password ni generatedPassword** |

## Archivos tocados

| Archivo | Cambio |
|---------|--------|
| `lib/auth/protected-routes.ts` | +2 entradas: promote (guardAdmin) y enrollment DELETE (guardUser) |

## Riesgos y mitigaciones

- **Ningún cambio en `auth.ts` ni en guards** → sin impacto en sesión JWT, callbacks, CSRF ni cookies.
- G4 no introduce email/Resend; la password generada viaja solo en la respuesta HTTP (ver security-checklist).
- G11 libera el UNIQUE `(courseId, studentId)` → re-join permitido (comportamiento esperado, no es escalada de privilegios).