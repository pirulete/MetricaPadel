# Security Checklist — Etapa 2 + Etapa 3: Onboarding, Cursos, Dashboard y Management

> change_id: etapa2-3-onboarding-dashboard
> module: auth
> date: 2026-09-21
> status: in-progress
> Referencia: OWASP Top 10 (2021) + buenas prácticas de sesión/CSRF

## 1. Checklist de verificación (estado actual)

| # | Control | Estado | Evidencia |
|---|---------|--------|-----------|
| 1 | Registro nunca crea ADMIN | ✅ VERIFICADO | `registerSchema` sin `role`; `createUser` sin parámetro role; default DB `role='USER'` |
| 2 | Guard server-side en endpoints de cursos | ✅ Documentado | `lib/auth/protected-routes.ts` — 11 rutas nuevas |
| 3 | 401/403 en endpoints protegidos | ✅ Guard existente | `guardUser`/`guardAdmin` en `lib/auth/admin-guard.ts` |
| 4 | LOCKED nunca permitido | ✅ Guard existente | `guardUser`/`guardAdmin` rechazan status LOCKED |
| 5 | Ownership anti-IDOR en cursos | ✅ VERIFICADO | Queries scoped por `ownerId`; 404 si ajeno (courses.ts) |
| 6 | Coach no se une a su propio curso | ✅ VERIFICADO | `joinCourse` → `own_course` (400) |
| 7 | Join solo por inviteCode (sin listado público de cursos) | ✅ VERIFICADO | `getCourseByInviteCode` + `joinCourse`; no hay GET público de cursos |
| 8 | Auditoría en mutaciones sensibles | ✅ Requerido | `auditCreate/Update/Delete` para course, course_enrollment, course_rubric |
| 9 | Rate limit en registro | ✅ Existente | `checkRegistrationRateLimit` en register route |
| 10 | Validación Zod en inputs | ✅ Requerido | `lib/validations/padel.ts` (courseCreate/Update/Join/Assign/History) |
| 11 | InviteCode normalizado (upper, regex) | ✅ Requerido | `lib/padel/course-code.ts` (PAD-XXXX, case-insensitive) |
| 12 | Soft delete de curso (historial protegido) | ✅ VERIFICADO | `archiveCourse` → status='archived'; FKs no cascade en owner/rubric |
| 13 | Re-asignar rúbrica → 409 | ✅ VERIFICADO | UNIQUE(courseId, rubricId) en DB |
| 14 | Historial scoped por teacherId | ✅ Requerido | `listHistory(teacherId, filters)`; 404 si ajeno |

## 2. Mapeo OWASP Top 10 (2021)

| OWASP | Control aplicado |
|-------|------------------|
| A01 Broken Access Control | Guards por rol (ADMIN/USER) + ownership por `ownerId`/`teacherId`/`studentId` + 404 en vez de 403 para recursos ajenos |
| A02 Cryptographic Failures | Passwords bcrypt (existente); inviteCode no es secreto crítico (solo gate de acceso a curso) |
| A03 Injection | Drizzle ORM parametrizado; `upper()` vía SQL template con bindings |
| A04 Insecure Design | Registro nunca-ADMIN (D6); soft delete (D7); UNIQUE constraints como respaldo |
| A05 Security Misconfiguration | Sin variables de entorno nuevas; headers de seguridad ya aplicados en endpoints públicos |
| A06 Vulnerable Components | Gate `audit_deps` del harness (0 vulnerabilidades altas) |
| A07 Identification/Auth Failures | Sesión JWT + sliding window existente; guards validan status ACTIVE |
| A08 Software/Data Integrity | Zod en todos los inputs; inviteCode normalizado antes de lookup |
| A09 Logging/Monitoring | Auditoría en todas las mutaciones sensibles (course, enrollment, rubric) |
| A10 SSRF | Sin fetch a URLs de usuario en estos endpoints |

## 3. Requisitos de implementación para @app-engineer (bloqueantes)

1. **Registro (SCR-02)**: agregar `role?: 'coach'|'player'` al schema del body pero **ignorarlo** — no pasarlo a `createUser`, no persistirlo. Nunca derivar rol del body.
2. **Route handlers de cursos**: usar `guardAdmin` + verificar `ownerId` en cada query; recurso ajeno → 404 (no 403).
3. **`POST /api/courses/[id]/rubrics`**: validar que el curso es propio Y la rúbrica es propia + `status='active'` (404 si no); traducir constraint UNIQUE a 409.
4. **`POST /api/courses/join`**: `guardUser`; traducir `own_course`→400, `not_found`/`archived`→404, `already_enrolled`→409.
5. **Auditoría**: `auditCreate('course', ...)`, `auditUpdate('course', ...)`, `auditDelete('course', ...)`, `auditCreate('course_enrollment', ...)`, `auditCreate('course_rubric', ...)` con `extractRequestContext(request)`.
6. **Dashboard**: `GET /api/dashboard/teacher` → guardAdmin; `GET /api/dashboard/student` → guardUser. Nunca exponer datos de otro rol.
7. **Historial**: `GET /api/history` → guardAdmin + `teacherId=me` en la query; filtros validados por Zod.

## 4. Tests de seguridad requeridos

| Test | Archivo | Verifica |
|------|---------|----------|
| Guard 401/403 por endpoint | `tests/api/padel/courses-guard.spec.ts` | Sin sesión → 401; USER en coach → 403; ADMIN en join → 403 |
| Join edge cases | `tests/api/padel/join-happy.spec.ts` | 201, 400 own_course, 404 código inválido/archivado, 409 ya inscrito |
| IDOR historial | `tests/api/padel/history-happy.spec.ts` | Evaluación de otro coach → 404 |
| Registro nunca-ADMIN | `tests/api/auth/register.spec.ts` (ampliar) | Body con `role:'coach'` → usuario creado es USER/TEMPORARY |
| Unit course-code | `tests/unit/padel/course-code.test.ts` | Formato PAD-XXXX, colisión, case-insensitive |
| Unit validations | `tests/unit/validations/padel.test.ts` (ampliar) | Schemas course create/update/join/assign/history |

## 5. Riesgos residuales aceptados

- **InviteCode de 4 chars** (36^4 ≈ 1.6M combinaciones): suficiente para MVP; si se requiere más entropía, subir a 6 chars en release futuro.
- **Sin rate limit específico en join**: mitigado por rate limit global existente y por requerir sesión autenticada (guardUser). Revisar si el abuso de join se vuelve problema real.
- **Sin hard delete de cursos**: intencional (D7) — historial protegido.

## 6. Estado del gate `auth-impact`

- Guard server-side verificado: ✅ (guards existentes + rutas documentadas)
- 403 en endpoints protegidos: ✅ (guardAdmin/guardUser)
- Auditoría configurada: ✅ (helpers existentes + entidades mapeadas)
- Registro nunca-ADMIN: ✅ (verificado en código actual)