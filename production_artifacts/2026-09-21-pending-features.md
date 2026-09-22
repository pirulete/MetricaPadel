# Pending Features — Padel Evaluativo

> status: proposed
> release: v0.5 (objetivo)
> date: 2026-09-21
> change_id: pending-features-analysis
> module: docs
> tags: [roadmap, gaps, backlog, tech-debt, padel]
> Fuentes: `FEATURES.md`, `production_artifacts/2026-09-21-user-flows-v2.md` (§7), `production_artifacts/2026-09-21-rubric-gap-analysis.md`, `ARCHITECTURE.md`, test matrices y ponytail reviews de etapas 1-4.

---

## 1. Completed Features Summary

| Etapa / Gap | change_id | Release | Estado | Alcance |
|---|---|---|---|---|
| Etapa 1: Core Evaluativo (rúbricas + evaluaciones) | `etapa1-core-evaluativo` | v0.1 | released | 6 tablas, 3 enums, 15 endpoints, 7 páginas, P02/P03/P09/A03 |
| Etapa 2+3: Onboarding, Cursos, Dashboard y Management | `etapa2-3-onboarding-dashboard` | v0.2 | released | registro/login reales, cursos + inviteCode, dashboards por rol, historial (P01/A01/P05/P07/P10) |
| G3: Promoción USER→ADMIN | `gaps-user-flows` | v0.3 | released | `POST /api/admin/users/[id]/promote` |
| G4: Credenciales al crear alumno | `gaps-user-flows` | v0.3 | released | `generatedPassword` (12 chars, devuelta 1 vez) |
| G9: Trigger `evaluation.published` | `gaps-user-flows` | v0.3 | released | notificación P1 system con CTA `/evaluaciones/{id}` |
| G11: Auto-desinscripción de curso | `gaps-user-flows` | v0.3 | released | `DELETE /api/courses/[id]/enrollment` |
| G5: Perfil y Settings con cambio de contraseña | `g5-profile-settings` | v0.3 | released | `PUT /api/user/password`, `app/(app)/settings` |
| G8: Detalle de curso del alumno | `student-course-detail` | v0.3 | released | `GET /api/student/courses/[id]`, cards clickeables |
| G10: Admin UI gestión de usuarios (CRUD) | `g10-admin-users-ui` | v0.3 | released | PUT/DELETE(lock)/unlock, `/admin/users` |
| R5: Cobertura dimensional soft-block | `r5-dimensional-coverage` | v0.3 | released | `checkDimensionalCoverage` + toast warning al publicar |
| Etapa 4: Evolución del Alumno + Gestión de Alumnos (G6/G7/G12) | `etapa4-evolution-management` | v0.4 | **in-progress** | versiones (`evaluations.version`), `/evolucion`, series, add/remove students, search candidatos |

**Nota**: Etapa 4 (v0.4) está marcada `in-progress` en FEATURES.md — sus E2E (`evaluation-version.spec.ts`, `student-evolution.spec.ts`, `course-students.spec.ts`) figuran como "pendientes en etapa QA".

---

## 2. Remaining Gaps (de user-flows-v2 §7, filtrado)

Cerrados en v0.3/v0.4: G3, G4, G5, G6, G7, G8, G9, G10, G11, G12. **Quedan 7 abiertos:**

| # | Gap | Descripción | Prioridad | Esfuerzo | Qué desbloquea |
|---|---|---|---|---|---|
| G17 | E2E de Etapa 1 pendientes de QA (`rubric-editor`, `evaluation-flow`, `student-view`) | 3 specs E2E navegables nunca creados; carpeta `2026-09-21-fix-g17-e2e-tests/` está vacía | **Alta** (bloqueante de gate `tests`) | Bajo | Cierra el quality gate `tests` de Etapa 1; confianza en flujos P03/P09/A03 |
| G2 | Exportación CSV de evaluaciones/historial | No hay forma de descargar historial/evaluaciones para análisis externo | Media | Medio | Reportes offline, análisis del coach fuera de la app |
| G15 | Paginación en listados de rúbricas/evaluaciones/cursos | Solo notifications tiene cursor pagination; los listados padel crecen sin límite | Media | Medio | Escalabilidad con >100 rúbricas/evaluaciones; UX consistente |
| G13 | Notificación al coach cuando el alumno marca leída | El coach no sabe si el alumno vio su evaluación (solo existe `readAt` en DB) | Baja | Bajo | Cierre del loop de feedback coach↔alumno |
| G14 | Plantillas de rúbrica precargadas en UI | Solo existe seed manual `RUBRICA_INTEGRAL_TEMPLATE`; el editor no ofrece templates | Baja | Bajo | Onboarding del coach más rápido y con cobertura dimensional |
| G16 | Soft-delete de evaluaciones | Solo hay archive de rúbricas y cursos; una evaluación publicada no se puede retirar | Baja | Bajo | Corrección de errores de publicación sin perder historial |
| G1 | Edición de perfil desde el admin | El admin no puede editar datos de un jugador desde `/admin/users` (solo desde settings del propio usuario) | Baja | Medio | Gestión centralizada de datos de alumnos |

### Gaps de rúbricas (de rubric-gap-analysis.md, todos abiertos)

| ID | Gap | Prioridad | Esfuerzo | Qué desbloquea |
|---|---|---|---|---|
| R1 | **Falta dimensión "Reglas y conocimiento del juego"** — no existe categoría `reglas` en `rubric_category` (único gap de cumplimiento estricto) | **Alta** | Medio | Cobertura de las 6 dimensiones de la rúbrica integral de pádel |
| R2 | `tecnica` mezcla técnica básica y específica (split requiere decisión de producto) | Media | Alto | Reportes/filtros por sub-dimensión |
| R4 | Sin seed/plantilla "Rúbrica Integral" con criterios de las 6 dimensiones | Media | Bajo | Coach parte de cobertura completa (relacionado con G14) |
| R5 | Sin validación de cobertura dimensional al crear/publicar rúbrica (soft warning) | Baja | Bajo | Evita rúbricas 100% técnica sin reglas/física/actitud |
| R3 | `actitud` no expresa cooperación/trabajo en equipo (label) | Baja | Bajo | Claridad semántica en UI |

---

## 3. Missing Infrastructure

| Infraestructura | Estado actual | Por qué importa |
|---|---|---|
| **E2E coverage del dominio padel** | Etapa 1 sin E2E (G17); Etapa 4 con E2E pendientes de QA | El gate `tests` exige ≥1 E2E navegable por feature UI; sin esto el harness no puede aprobar releases |
| **Paginación genérica para listados** | Solo `notifications` tiene cursor; rubrics/evaluations/courses/history devuelven todo | G15; sin paginación el payload crece O(n) y la UX degrada |
| **Seed script del dominio padel** | Solo existe `scripts/seed-marketing.ts`; el padel depende de seed manual (`RUBRICA_INTEGRAL_TEMPLATE`) | R4/G14: un `seed-padel.ts` con rúbrica integral + demo data aceleraría dev y QA |
| **Utilidad de exportación (CSV)** | No existe | G2; patrón reutilizable para evaluaciones, historial y listados admin |
| **Patrón soft-delete para evaluaciones** | Existe archive (rúbricas/cursos) pero no para evaluaciones | G16; consistencia del modelo de ciclo de vida |
| **Template picker en el editor de rúbricas** | No existe | G14/R4; UX de creación de rúbricas |
| **Notificación de eventos inversos (alumno→coach)** | Solo hay triggers coach→alumno (`evaluation.published`, `account.*`) | G13; el engine soporta cualquier trigger, falta el caso de uso |

---

## 4. Product Recommendations

### Quick Wins (1-2 días)

| # | Feature | Justificación |
|---|---|---|
| 1 | **G17 — Completar E2E de Etapa 1** (`rubric-editor`, `evaluation-flow`, `student-view`) | Desbloquea el gate `tests` y cierra el único gap "Alta" abierto; patrón ya existe en `notifications.spec.ts` |
| 2 | **G14 + R4 — Template picker con seed "Rúbrica Integral"** (6 dimensiones) | Bajo esfuerzo, alto impacto en onboarding del coach; reutiliza `RUBRICA_INTEGRAL_TEMPLATE` |
| 3 | **R3 — Renombrar label `actitud` → "Actitud y trabajo en equipo"** | Cambio de UI de 1 línea; elimina ambigüedad semántica |
| 4 | **G13 — Notificación al coach al marcar leída** | El engine ya existe; solo falta un trigger `evaluation.read` + query de coachId |
| 5 | **Fix FLAKY-1** (`promote-happy.spec.ts` cleanup: castear `entity_id::uuid`) | Bug de test documentado; deja audit_logs residuales |

### Medium Features (3-5 días)

| # | Feature | Justificación |
|---|---|---|
| 1 | **R1 — Agregar categoría `reglas` al enum `rubric_category`** (DB + Zod + editor + migración aditiva) | Único gap de cumplimiento estricto de la rúbrica integral; desbloquea las 6 dimensiones |
| 2 | **G15 — Paginación en listados padel** (rubrics/evaluations/courses/history) | Escalabilidad; reutilizar patrón cursor de notifications |
| 3 | **G2 — Exportación CSV de evaluaciones/historial** | Valor analítico inmediato para el coach; endpoint + botón en historial |
| 4 | **G16 — Soft-delete de evaluaciones** | Permite retirar publicaciones erróneas conservando historial y versiones |

### Major Features (1+ semana)

| # | Feature | Justificación |
|---|---|---|
| 1 | **R2 — Split de `tecnica` en `tecnica_basica`/`tecnica_especifica`** | Requiere decisión de producto + migración de datos existentes + impacto en queries/reportes/UI; alto valor analítico pero alto riesgo |
| 2 | **G1 — Edición de perfil desde admin** | Extiende G10; requiere decidir qué campos son editables por admin vs usuario (email inmutable) |
| 3 | **R5 (rúbrica) — Validación de cobertura dimensional al publicar rúbrica** | Soft warning al crear rúbricas sin las 6 dimensiones; complementa el soft-block R5 de evaluaciones ya existente |

**Orden sugerido**: Quick Wins 1-5 → R1 → G15 → G2 → G16 → (decisión de producto) R2/G1.

---

## 5. Technical Debt

| Item | Fuente | Severidad | Detalle |
|---|---|---|---|
| **FLAKY-1**: `promote-happy.spec.ts` afterAll cleanup falla (`varchar = uuid`) | test-matrix gaps-user-flows | Baja (test-only) | `audit_logs.entity_id` es `varchar(100)` vs `users.id` uuid; fix: castear `entity_id::uuid`; deja audit_logs residuales |
| **E2E faltantes Etapa 1** (G17) | test-matrix etapa1 | Media | 3 specs nunca creados; carpeta `fix-g17-e2e-tests/` vacía |
| **E2E Etapa 4 pendientes de QA** | FEATURES.md (etapa4) | Media | `evaluation-version`, `student-evolution`, `course-students` marcados "pendientes en etapa QA" |
| **Cobertura unit baja en módulos nuevos** | test-matrix gaps-user-flows | Baja | `triggers.ts` 71.42% statements / 33.33% functions; `enrollments.ts` 71.42% functions; `admin-users.ts` 33.33% branches |
| **Lint warnings acumulados** | release-reports | Baja | 117-126 warnings no bloqueantes preexistentes |
| **Sin paginación en listados padel** (G15) | user-flows-v2 §7 | Media | Se convertirá en problema de performance con datos reales |
| **Carpetas de fix vacías** | filesystem | Baja | `2026-09-21-fix-g17-e2e-tests/`, `2026-09-21-fix-rubric-dimensions/`, `2026-09-21-fix-login/` existen sin artifacts — trabajo iniciado y no completado |
| **Dependencia de seed manual para rúbricas** | rubric-gap-analysis | Baja | Sin `seed-padel.ts`, cada entorno requiere setup manual del template |

---

## Out-of-Scope (explícito)

- Snapshot de rúbrica al publicar (fuera de alcance desde Etapa 1, rubric-gap-analysis).
- Niveles editables (escala fija 4 niveles es decisión de producto cerrada).
- Cambios de esquema sin aprobación de producto (R2/R3/R4/R5 de rúbricas).
- Marketing CMS y push/notifications genéricos (ya released, dominio whitelabel).