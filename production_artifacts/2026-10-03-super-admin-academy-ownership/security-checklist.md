# Security Checklist — Academias: Ownership SUPER_ADMIN + Solicitudes de Acceso (auth-security)

> change_id: 2026-10-03-super-admin-academy-ownership
> date: 2026-10-03
> module: auth+academy
> status: in-progress

## OWASP Top 10 — revisión por cambio

| OWASP | Control aplicado | Estado |
|-------|------------------|--------|
| A01 Broken Access Control | Guard compuesto `guardSuperAdminOrAcademyRole` server-side por endpoint; 404 anti-IDOR (nunca 403 para recursos ajenos); `canAssignAcademyRole` en handler (role=OWNER solo SUPER_ADMIN); invariante último OWNER en queries tx; `guardSuperAdmin` en endpoints puros SA (create/transfer/restore/requests) | ✅ |
| A02 Cryptographic Failures | Sin cambios criptográficos (JWT/session/cookies intactos) | ✅ |
| A03 Injection | Zod en todos los bodies nuevos (discriminated union join/create); queries Drizzle parametrizadas; payload jsonb validado | ✅ |
| A04 Insecure Design | sessionGate corre PRIMERO en el guard compuesto — el bypass SUPER_ADMIN no salta el gate de sesión; el path SA verifica existencia de academia (404) antes de operar; re-validación dentro de tx en approve (academia activa, no miembro, slug libre) | ✅ |
| A05 Security Misconfiguration | Sin env vars nuevas; sin cambios de cookies/CSRF/session TTL; `NEXTAUTH_SECRET` intacto | ✅ |
| A07 Identification/Auth Failures | Estados respetados: ACTIVE obligatorio; LOCKED/TEMPORARY → 403 incluso para SUPER_ADMIN (sessionGate) | ✅ |
| A09 Logging/Monitoring | 6 eventos de auditoría nuevos en `lib/audit/academy.ts` (REQUEST_CREATED/APPROVED/REJECTED, OWNERSHIP_TRANSFERRED, ACADEMY_RESTORED, MEMBER_ROLE_ASSIGNED) | ✅ |
| A10 SSRF | Sin cambios | ✅ |

## Checklist de seguridad

- [x] Guard server-side verificado: `guardSuperAdminOrAcademyRole` (async, `Promise<NextResponse | null>`), null = OK.
- [x] 401 sin sesión / 403 LOCKED/TEMPORARY / 403 rol insuficiente / 404 anti-IDOR en todos los endpoints nuevos y modificados.
- [x] SUPER_ADMIN bypass NUNCA opera sin verificar existencia del recurso (404 si la academia no existe).
- [x] SUPER_ADMIN permite academias archivadas (visibilidad plataforma, D4) — no-SA sigue 404 en archivadas.
- [x] TEMPORARY/LOCKED nunca pasan: sessionGate primero, incluso para SUPER_ADMIN.
- [x] Anti-IDOR: 404 para recursos ajenos/inexistentes (membresía, academia, solicitud, target no miembro en transfer — spec AC-07).
- [x] Invariante OWNER: transferencia/assign transaccionales; nunca 0 OWNER activo (`last_owner` → 400); `role=OWNER` solo SUPER_ADMIN (regla handler).
- [x] Auditoría en mutaciones sensibles: 6 helpers nuevos en `lib/audit/academy.ts` (helpers.ts NO se toca).
- [x] Rate limit en `POST /api/academy-requests`: `academy-request:{ip}` 10/min (constantes las crea @app-engineer en `lib/rate-limit.ts`).
- [x] Sin variables de entorno nuevas; sin cambios en cookies/CSRF/session TTL.
- [x] `tsc --noEmit` 0 errores; 22 tests unit nuevos (guard compuesto); `academy-guard.ts` 100% cobertura.

## Pendiente (otros agentes)

- [ ] Endpoints `/api/academies/*` y `/api/academy-requests/*` con guards mapeados en auth-impact.md (@app-engineer).
- [ ] Constantes `ACADEMY_REQUEST_MAX`/`ACADEMY_REQUEST_WINDOW_MS` en `lib/rate-limit.ts` (@app-engineer).
- [ ] API tests guard 401/403/400/404/409 + happy-path SQL real por endpoint (@app-engineer).
- [ ] Migrar tests existentes que crean academia con ADMIN a helper SUPER_ADMIN (`pdf-happy`, `members-happy`, `institutional-rubrics-happy`, `academies-guard`) (@app-engineer).
- [ ] Path SUPER_ADMIN en `canAccessRubric` para detalle de rúbricas institucionales (app-notes §3, opción b) (@db-engineer o agente asignado).
- [ ] `lib/api-docs/spec.ts` con endpoints nuevos (@app-engineer).
- [ ] UI admin platform academias/solicitudes con `validateSuperAdmin` (@admin-engineer).
- [ ] E2E flujo SA aprueba join → asigna rol → transfiere ownership (@admin-engineer).
- [ ] Verificación post-migración: `SELECT owner_id FROM academies` y `count(*) FROM academy_memberships WHERE role='OWNER' AND user_id <> '<sa_id>'` = 0 (@db-engineer).