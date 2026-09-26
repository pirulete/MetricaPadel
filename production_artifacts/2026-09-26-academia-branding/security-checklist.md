# Security Checklist — SPEC-EPIC-01 Fase B: Guards de Academia

> status: in-progress
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: auth
> tags: [security, owasp, rbac, idor, audit]

## 1. Revisión OWASP Top 10

| OWASP | Control aplicado | Estado |
|-------|------------------|--------|
| A01 Broken Access Control | RBAC por academia DB-backed (`academy_memberships`), nunca claims del JWT; jerarquía OWNER > ADMIN > COACH | ✅ |
| A01 IDOR | Anti-IDOR: membresía inexistente o academia archivada → **404** (no 403) para no filtrar existencia | ✅ |
| A02 Cryptographic Failures | Sin cambios en crypto; sesión JWT existente intacta | ✅ |
| A03 Injection | Drizzle ORM parametrizado; sin SQL crudo en guards | ✅ |
| A04 Insecure Design | Guard por request (no cacheado); revocación de membresía efectiva inmediata | ✅ |
| A05 Misconfiguration | Sin headers/env nuevos; `protected-routes.ts` como referencia de guard por endpoint | ✅ |
| A07 Auth Failures | Estados LOCKED/TEMPORARY bloqueados en guards de academia (403) | ✅ |
| A09 Logging Failures | Auditoría en todas las mutaciones de academia (5 eventos nuevos) | ✅ |

## 2. Checklist de seguridad por archivo

### `lib/auth/academy-guard.ts` (NUEVO)
- [x] Guards son async y DB-backed (consultan `academy_memberships` + `academies` en cada request)
- [x] `getAcademyMembership` filtra `status = 'active'` en membresía Y `status = 'active'` en academia
- [x] 401 si no autenticado; 403 si LOCKED o TEMPORARY; 404 anti-IDOR; 403 rol insuficiente
- [x] No se filtra información de existencia de recursos ajenos (404 genérico)
- [x] `user_role` global intacto — sin bypass de guardAdmin/guardUser
- [x] Sin logging de datos sensibles (solo errores genéricos en respuesta)

### `lib/audit/helpers.ts` (MOD)
- [x] 5 eventos nuevos: ACADEMY_CREATED/UPDATED/ARCHIVED, MEMBER_INVITED/REMOVED
- [x] `auditAcademyCreated` usa `ownerId` como fallback de actor si falta context.userId
- [x] `auditMemberRemoved` preserva `academyId` en oldValues (trazabilidad)
- [x] Metadata `{ academy: true, action: ... }` para filtrado forense

### `lib/notifications/triggers.ts` (MOD)
- [x] `triggerAcademyInvite` con `groupId = membershipId` (dedup 1h, evita spam de re-invitación)
- [x] CTA apunta a ruta interna (`/academias`), sin URLs externas controlables

### `lib/auth/protected-routes.ts` (MOD)
- [x] Documenta guard correcto por endpoint planeado
- [x] Mutaciones sensibles mapeadas a audit helpers

## 3. Riesgos residuales / pendientes (Fase C)

| Riesgo | Mitigación pendiente | Responsable |
|--------|----------------------|-------------|
| Invitación crea usuario TEMPORARY con password generado | Seguir patrón G4 (password temporal + forzar cambio); rate limit en invite | @auth-security + @app-engineer |
| Slug de academia colisiona | UNIQUE en DB + 409 en API; validación regex `^[a-z0-9-]{3,50}$` | @app-engineer |
| Logo upload (data-URL) | MIME real + dims ≤1024 + sanitización SVG (DOMPurify) + límite 2MB | @app-engineer |
| Rate limiting en endpoints públicos de academia | `lib/rate-limit.ts` en invite/accept | @app-engineer |
| API tests de guard (401/403/404/409) con SQL real | `tests/api/padel/academies-guard.spec.ts` | @app-engineer |
| E2E flujo navegable | `tests/e2e/academy-branding.spec.ts` | @qa-release |

## 4. Verificación final

- [x] `npx tsc --noEmit` — 0 errores
- [x] ESLint — 0 errores (solo warnings de `any` pre-existentes en patrón de guards)
- [x] Unit tests guards — 22/22 passing
- [x] Unit tests audit helpers — 19/19 passing (cobertura helpers.ts 65.6% → 73.4%)
- [x] Unit tests triggers — 17/17 passing
- [ ] API tests happy-path + guard (Fase C)
- [ ] E2E (Fase C)