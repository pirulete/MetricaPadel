# Roadmap — Métrica Pádel

> status: proposed
> release: docs
> date: 2026-09-28
> change_id: roadmap-2026-09-28
> module: docs
> tags: [roadmap, backlog, gaps, tech-debt, priorities]
> Fuentes: `FEATURES.md` (39 entradas), `ARCHITECTURE.md`, `production_artifacts/2026-09-21-pending-features.md`, `2026-09-21-user-flows-v2.md`, `2026-09-21-rubric-gap-analysis.md`, `2026-09-22-features-audit.md`, `2026-09-27-super-admin-audit/audit-report.md`, `2026-09-26-academia-branding/security-checklist.md`, verificación de `tests/e2e/` en filesystem.

---

## 1. Features Completadas (Released)

### Por versión

| Versión | change_ids | Conteo |
|---------|-----------|--------|
| **v0.1** | `etapa1-core-evaluativo`, `marketing-cms`, `fix-db-fallback` | 3 |
| **v0.2** | `etapa2-3-onboarding-dashboard`, `streetmove-sync-port`, `2026-08-02-harness-improvements` | 3 |
| **v0.3** | `gaps-user-flows` (G3/G4/G9/G11), `g5-profile-settings`, `student-course-detail` (G8), `g10-admin-users-ui`, `r5-dimensional-coverage`, `g17-e2e-etapa1`, `landing-redesign`, `fix-vercel-build`, `fix-auth-ux`, `fix-db-fallback`, `push-notifications`, `push-notifications-api`, `push-infra-hooks-sw`, `notification-inbox`, `infra-sync-port`, `auth-sync-port`, `harness-refactor`, `project-blueprint` | 18 |
| **v0.4** | `etapa4-evolution-management` (G6/G7/G12), `fix-csrf-login`, `fix-login-redirect`, `remove-gratuito-rebrand`, `supercommit-system`, `rubric-dimensions` (R1/R2/R3) | 6 |
| **v0.5** | `p0-core-p1-courses`, `neon-preview-branch`, `readme-metrica-padel` | 3 |
| **v0.6** | `spec-epic-01-academia-branding` (Fases A-E + QA 20/20 gates) | 1 |
| **v0.7** | `super-admin-role` (rol + guards + endpoints + UI) | 1 |

**Total: 35 entradas released** (v0.1 → v0.7). El core del producto está completo: rúbricas 6 dimensiones, evaluaciones con versiones, cursos con inviteCode, dashboards por rol, evolución del alumno, academias multi-tenant con branding + PDF, notificaciones push/inbox, CMS marketing, y jerarquía SUPER_ADMIN.

### Nota de consistencia
- `etapa4-evolution-management` figura released en FEATURES.md pero sus 3 E2E (`evaluation-version`, `student-evolution`, `course-students`) **no existen** en `tests/e2e/` (verificado en filesystem). El status "released" es prematuro hasta cerrar ese gate.
- `super-admin-role` tiene la entrada principal released pero 2 sub-entradas `in-progress` (Auth Security, Endpoints+UI) — el E2E `super-admin.spec.ts` ya existe, por lo que el cierre real está pendiente solo de QA formal.

---

## 2. Features Pendientes / Propuestas

### Gaps de user flows abiertos (de `2026-09-21-pending-features.md` §2, filtrado a lo que sigue vigente)

| # | Gap | Prioridad | Esfuerzo | Estado |
|---|-----|-----------|----------|--------|
| G2 | Exportación CSV de evaluaciones/historial | Media | Medio | Abierto |
| G15 | Paginación en listados padel (rubrics/evaluations/courses/history) | Media | Medio | Abierto |
| G13 | Notificación al coach cuando el alumno marca leída | Baja | Bajo | Abierto |
| G14 | Plantillas de rúbrica precargadas en UI (template picker) | Baja | Bajo | Abierto (el template `RUBRICA_INTEGRAL_TEMPLATE` existe en `lib/padel/rubric-templates.ts` pero sin UI) |
| G16 | Soft-delete de evaluaciones | Baja | Bajo | Abierto |
| G1 | Edición de perfil desde admin | Baja | Medio | Abierto |

### Gaps de rúbricas (de `2026-09-21-rubric-gap-analysis.md`)

| ID | Gap | Estado |
|----|-----|--------|
| R1 | Falta categoría `reglas` | ✅ **CERRADO** en v0.4 (`rubric-dimensions`) |
| R2 | Split `tecnica` → `tecnica_basica`/`tecnica_especifica` | ✅ **CERRADO** en v0.4 |
| R3 | `actitud` → `actitud_equipo` | ✅ **CERRADO** en v0.4 |
| R4 | Seed/plantilla "Rúbrica Integral" | ⚠️ **PARCIAL** — template existe, falta template picker en UI (= G14) |
| R5 | Validación de cobertura dimensional al publicar rúbrica (soft warning) | ❌ Abierto (solo existe el soft-block R5 de evaluaciones) |

### Out-of-scope de specs aprobados que quedaron sin implementar

| Fuente | Item | Estado |
|--------|------|--------|
| `2026-09-27-super-admin/feature-spec.md` | Dashboard de métricas globales (usuarios/academias/evaluaciones) | ❌ No implementado (diferido a iteración posterior) |
| `2026-09-27-super-admin/feature-spec.md` | Gestión de términos/legal desde UI admin | ❌ No implementado (infraestructura `terms_versions` existe, sin UI) |
| `2026-09-27-super-admin-audit` G6 | Archivar academias a nivel plataforma (super admin) | ⚠️ Parcial — solo `GET /api/admin/academies` (listado), sin archivar |
| `2026-09-27-super-admin-audit` G10 | Settings globales de plataforma (feature flags, mantenimiento) | ⚠️ Parcial — `/admin/platform` es read-only |
| `2026-09-26-academia-branding/security-checklist.md` | Rate limiting en endpoints de academia (invite/accept) | ❌ Pendiente (riesgo residual documentado) |

---

## 3. Gaps de UX/Funcionalidad

- **BUG-05 (abierto, fuera de scope de v0.6)**: home guard de marketing — DELETE de la única página `home` publicada devuelve 200 en vez de 400. Documentado en QA de academia-branding.
- **Avatar de perfil**: `users.avatar_url` existe en DB (v0.2) pero no hay UI para subirlo ni endpoint de upload visible — solo capa de datos.
- **Términos y condiciones**: infraestructura `terms_versions`/`user_terms_acceptance` existe pero sin UI admin ni flujo de aceptación visible al usuario.
- **E2E Etapa 4 ausentes**: `evaluation-version.spec.ts`, `student-evolution.spec.ts`, `course-students.spec.ts` — el flujo de versiones/evolución/gestión de alumnos no tiene cobertura E2E navegable (viola el gate `tests` de features UI).
- **Dashboard de métricas globales**: ARCHITECTURE.md documenta dashboards por-owner (teacher/student); no existe vista global de plataforma (solo counts read-only en `/admin/platform`).
- **Rate limiting**: `lib/rate-limit.ts` se usa en endpoints públicos y push, pero los endpoints de academia (invite/accept) no lo aplican — riesgo de spam documentado en security-checklist.

---

## 4. Backlog de Infra/Calidad

### Tests pendientes
| Item | Severidad | Detalle |
|------|-----------|---------|
| E2E Etapa 4 (3 specs) | Media | `evaluation-version`, `student-evolution`, `course-students` — marcados "pendientes en etapa QA" desde v0.4 |
| FLAKY-1 | Baja | `promote-happy.spec.ts` afterAll cleanup falla (`audit_logs.entity_id` varchar vs `users.id` uuid); fix: castear `entity_id::uuid`; deja audit_logs residuales |
| Cobertura unit baja | Baja | `triggers.ts` 71.42% statements / 33.33% functions; `enrollments.ts` 71.42% functions; `admin-users.ts` 33.33% branches |

### Tech debt conocido
| Item | Severidad | Detalle |
|------|-----------|---------|
| Sin paginación en listados padel (G15) | Media | Payload O(n); se degrada con datos reales |
| Lint warnings acumulados | Baja | 117-126 warnings no bloqueantes preexistentes |
| Carpetas de fix vacías | Baja | `2026-09-21-fix-g17-e2e-tests/`, `2026-09-21-fix-rubric-dimensions/`, `2026-09-21-fix-login/` existen sin artifacts — trabajo iniciado y no completado |
| Sin `seed-padel.ts` | Baja | Cada entorno requiere setup manual del template de rúbrica |
| Harness refactor incompleto | Baja | `validate-harness.js` monolito intacto; módulos en `lib/modules/harness/` listos pero sin entry point refactorizado |
| Docs: `change_id` duplicado | Baja | `push-notifications` y `push-notifications-api` comparten change_id (audit I1) |
| Docs: `project-blueprint` | Baja | status `proposed` con sección "Solución Implementada" (audit I3) |

---

## 5. Recomendación de Prioridades

### Hacer primero (impacto alto × esfuerzo bajo)
1. **E2E Etapa 4 (3 specs)** — cierra el único status `in-progress` real de v0.4 y el gate `tests`; patrón ya existe en `academy-branding.spec.ts`.
2. **BUG-05 (home guard marketing)** — bug conocido de comportamiento, fix de 1 endpoint.
3. **Rate limiting en invite/accept de academia** — riesgo de seguridad residual documentado; reutiliza `lib/rate-limit.ts`.
4. **G13 — trigger `evaluation.read`** — el engine ya existe; solo falta el trigger + query de coachId.
5. **G14 — template picker** — reutiliza `RUBRICA_INTEGRAL_TEMPLATE`; alto impacto en onboarding del coach.

### Después (impacto medio × esfuerzo medio)
6. **G15 — paginación en listados padel** — reutilizar patrón cursor de notifications; evita degradación con datos reales.
7. **G2 — exportación CSV** — valor analítico inmediato para el coach.
8. **G16 — soft-delete de evaluaciones** — permite retirar publicaciones erróneas conservando historial/versiones.
9. **Dashboard de métricas globales (super admin)** — cierra el out-of-scope diferido de v0.7.
10. **R5 (rúbrica) — validación de cobertura dimensional al publicar** — complementa el soft-block de evaluaciones.

### Puede esperar
- **G1 — edición de perfil desde admin** (baja demanda; el usuario edita su propio perfil).
- **UI de términos/legal** — solo si el negocio lo exige legalmente.
- **Avatar upload UI** — capa de datos lista, sin caso de uso de producto claro.

### Probablemente nunca será necesario (YAGNI)
- **RBAC granular por módulo** — descartado explícitamente en super-admin spec; el enum jerárquico cubre el caso.
- **Self-service de registro SUPER_ADMIN** — siempre seed/DB manual (decisión cerrada).
- **Snapshot de rúbrica al publicar** — out-of-scope desde Etapa 1.
- **Niveles editables** — escala fija de 4 niveles es decisión de producto cerrada.
- **Transferencia de ownership de academia** — out-of-scope explícito de v0.6.

---

## Referencias
- `production_artifacts/2026-09-21-pending-features.md`
- `production_artifacts/2026-09-21-rubric-gap-analysis.md`
- `production_artifacts/2026-09-21-user-flows-v2.md` (§7)
- `production_artifacts/2026-09-22-features-audit.md`
- `production_artifacts/2026-09-27-super-admin-audit/audit-report.md`
- `production_artifacts/2026-09-27-super-admin/feature-spec.md`
- `production_artifacts/2026-09-26-academia-branding/security-checklist.md`
- `FEATURES.md`, `ARCHITECTURE.md`, `tests/e2e/`