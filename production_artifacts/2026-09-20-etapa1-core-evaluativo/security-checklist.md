# Security Checklist — Etapa 1: Core Evaluativo (Rúbricas + Evaluaciones)

> change_id: etapa1-core-evaluativo
> module: auth
> date: 2026-09-20
> status: in-progress

## 1. OWASP Top 10 — Revisión por Categoría

| OWASP | Aplicación | Estado | Evidencia / Acción |
|-------|-----------|--------|--------------------|
| A01 Broken Access Control | **Alta** | ✅ Diseñado | guardAdmin/guardUser server-side en los 15 endpoints; ownership anti-IDOR en queries (404 ajeno); USER no accede a rutas coach; ADMIN no accede a evaluaciones de otros coaches. |
| A02 Cryptographic Failures | Media | ✅ | Passwords con `bcrypt.hash(password, 10)` (nunca plaintext). Sesión JWT con `NEXTAUTH_SECRET` (existente). Sin datos sensibles nuevos en DB. |
| A03 Injection | Media | ✅ | Drizzle ORM parametriza queries; Zod valida inputs en todos los endpoints; sin SQL concatenado. |
| A04 Insecure Design | Media | ✅ | Contract-first con schemas Zod; estados de rúbrica/evaluación explícitos (draft/active/archived, draft/published); publish valida criterios completos antes de publicar. |
| A05 Security Misconfiguration | Baja | ✅ | Sin env vars nuevas (D7); headers de seguridad existentes en endpoints públicos; sin cambios en auth.ts. |
| A06 Vulnerable Components | Baja | ⏳ | Gate `audit_deps` del harness (0 vulnerabilidades altas) antes de merge. |
| A07 Identification/Auth Failures | Media | ✅ | Reutiliza Auth.js existente; LOCKED bloqueado en rutas privadas; TEMPORARY no accede a rutas padel (solo ACTIVE en allowedStatuses). |
| A08 Software/Data Integrity | Baja | ✅ | Sin deserialización insegura; Zod valida payloads; sin firmas/verificación nuevas. |
| A09 Logging/Monitoring | Media | ✅ | Auditoría en todas las mutaciones sensibles (sección 3); `auditSecurityEvent` disponible para eventos de seguridad. |
| A10 SSRF | N/A | ✅ | Sin fetch a URLs de usuario. |

## 2. Controles de Sesión y Cookies

- [x] Sesión JWT long-lived con sliding window (existente, sin cambios).
- [x] HTTP-only cookies (Auth.js default, sin cambios).
- [x] CSRF: Auth.js maneja CSRF en endpoints de auth; los route handlers nuevos solo aceptan JSON con guard de sesión (no cookies de sesión en body).
- [x] LOCKED nunca permitido en rutas padel (`allowedStatuses: ['ACTIVE']` en todas).
- [x] TEMPORARY no permitido en rutas padel (solo ACTIVE).

## 3. Auditoría (audit_logs)

- [x] `POST /api/admin/users` → `auditCreate(user)`.
- [x] `POST /api/rubrics` → `auditCreate(rubric)`.
- [x] `PUT /api/rubrics/[id]` → `auditUpdate(rubric)`.
- [x] `DELETE /api/rubrics/[id]` → `auditDelete(rubric, archive)` (soft).
- [x] `POST /api/evaluations` → `auditCreate(evaluation)`.
- [x] `PUT /api/evaluations/[id]` → `auditUpdate(evaluation)`.
- [x] `POST /api/evaluations/[id]/publish` → `auditUpdate(evaluation, publish)`.
- [ ] `POST /api/student/evaluations/[id]/read` → **sin auditoría** (decisión explícita: idempotente, baja sensibilidad, evita ruido).
- [x] Todas usan `extractRequestContext(request)` para IP/user-agent.

## 4. Validación de Inputs (Zod)

- [x] `adminCreateUserSchema`: email válido, firstName/lastName 1-255, password min 8.
- [x] `rubricCreateSchema`: title 1-200, category enum, criteria min 1 con descriptors exact 4 (text 1-1000).
- [x] `rubricUpdateSchema`: partial de create.
- [x] `evaluationCreateSchema`: studentId/rubricId uuid.
- [x] `evaluationSaveSchema`: scores min 1, criteriaId/levelId uuid, comment opcional.
- [x] `listQuerySchema`: status opcional enum (evita valores arbitrarios).

## 5. Ownership y Anti-IDOR

- [x] Rúbricas: filtro `ownerId` en todas las queries (list/get/update/archive).
- [x] Evaluaciones coach: filtro `teacherId`.
- [x] Evaluaciones alumno: filtro `studentId` + solo `published`.
- [x] Recurso ajeno → 404 (no 403) para no filtrar existencia.
- [x] Tests de guard cubren 404 IDOR (`tests/api/padel/guard.spec.ts`).

## 6. Rate Limiting

- [ ] Endpoints padel **sin rate limit** en Etapa 1 (no son públicos; requieren sesión ADMIN/USER).
- [ ] Considerar `lib/rate-limit.ts` en `POST /api/admin/users` si se detecta abuso post-release (decisión documentada, no bloqueante).

## 7. Tests de Seguridad Requeridos

- [x] `tests/api/padel/guard.spec.ts` — 401 sin sesión, 403 USER en coach, 403 ADMIN en alumno, 404 IDOR.
- [x] `tests/unit/db/admin-users.test.ts` — createActiveUser (hash, ACTIVE, USER), email duplicado.
- [x] `tests/unit/db/rubrics.test.ts` / `evaluations.test.ts` — ownership (404 ajeno).
- [x] Happy-path con SQL real: `admin-users-happy`, `rubrics-happy`, `evaluations-happy`, `student-happy`.

## 8. Gates del Harness

- [x] `typecheck` 0 errores, `lint` 0 errores, `build` exitoso.
- [x] `secrets` 0 leaks (gitleaks), `sast` 0 hallazgos bloqueantes (semgrep).
- [x] `api-docs`: 15 paths nuevos en `lib/api-docs/spec.ts` (paths/padel.ts + schemas/padel.ts).
- [x] `coverage`: sin regresión >3% en módulos afectados.

## 9. Riesgos Aceptados (documentados)

1. **Crear usuario ACTIVE sin verificación de email** — requerido por flujo admin (D5). Mitigado con guardAdmin + auditoría + 409 duplicado.
2. **Sin rate limit en endpoints padel** — no públicos, requieren sesión. Revisar post-release.
3. **`markRead` sin auditoría** — idempotente, baja sensibilidad.
4. **Editar rúbrica publicada altera historial** — mitigado con totalScore/maxScore denormalizados (D4); snapshot post-MVP.