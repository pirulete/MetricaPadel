# SPEC-EPIC-01 — Administrador de Academia & Branding Institucional

> status: proposed
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: admin+api+db+ui
> tags: [multi-tenancy, branding, pdf, roles, rubrics, migration, upload]

## Problema

Las escuelas deportivas (academias) usan la app con varios profesores evaluando a los mismos alumnos, pero hoy:

1. **No existe entidad Academia**: cada coach (ADMIN) opera de forma aislada con sus propias rúbricas y cursos. No hay forma de agrupar profesores bajo una institución ni de estandarizar criterios entre ellos.
2. **No hay rol de profesor por academia**: el único rol de staff es ADMIN (coach). No se puede invitar a un profesor que pertenezca a múltiples academias ni limitar su alcance.
3. **No hay rúbricas institucionales**: las rúbricas son personales (`rubrics.ownerId`). Un profesor puede crear/modificar/archivar cualquier rúbrica propia, pero no existe una "Rúbrica Oficial" definida por la academia que los profesores usen sin poder alterar su estructura.
4. **No hay exportación PDF con branding**: los informes de evaluación solo se ven en pantalla. Las familias/alumnos no reciben un documento oficial con logo, colores y firma del profesor que justifique el valor del servicio.

## Objetivo

Entregar multi-tenancy ligero de academias sobre el modelo existente: entidad `academies` con branding (logo + color primario), membresías de profesores (multi-academia), rúbricas institucionales de solo-uso (read-only para profesores) y exportación PDF de evaluaciones con branding institucional y gráfico radar de las 6 dimensiones.

## Gap exacto (estado actual → estado deseado)

| Capacidad | Estado actual | Estado deseado | Gap |
|-----------|---------------|----------------|-----|
| Entidad Academia | No existe | Tabla `academies` (nombre, slug, logo, color) | Greenfield (RF-01) |
| Profesores multi-academia | Solo rol global USER/ADMIN | Membresía por academia (COACH_ACADEMIA) | Greenfield (RF-02) |
| Rúbricas institucionales | `rubrics.ownerId` personal, editable por su owner | Rúbrica con scope institucional, read-only para profesores | Extensión de `rubrics` (RF-03) |
| Exportación PDF | No existe | PDF con logo, color, radar 6 dims, firma | Greenfield (RF-04) |
| Branding en evaluaciones | Solo `marketing_settings.logo` (sitio público whitelabel, sin relación con evaluaciones) | Branding de academia aplicado a evaluaciones y PDF | Greenfield |

## Alcance detallado

### RF-01 — Entidad Academia (creación + branding)
- Tabla `academies`: `id`, `name` (1-200), `slug` (único, `^[a-z0-9-]{3,50}$`), `logoUrl` (nullable), `primaryColor` (HEX `^#[0-9A-Fa-f]{6}$`, default institucional), `ownerId` (FK users no cascade), `status` (active/archived), timestamps.
- Endpoints: `POST /api/academies` (crear, guardAdmin), `GET /api/academies` (listar las del usuario), `GET/PUT /api/academies/[id]` (detalle + editar branding, anti-IDOR 404), `DELETE /api/academies/[id]` (soft archive).
- Upload de logo: `POST /api/academies/[id]/logo` — SVG o PNG, máx 2MB, validación MIME + tamaño; almacenamiento a decidir por @architect (recomendado: `public/uploads/academies/` con nombre aleatorio; alternativa data-URL en DB).
- Auditoría en todas las mutaciones.

### RF-02 — Gestión de Profesores (membresías multi-academia)
- Tabla `academy_memberships`: `id`, `academyId` (FK cascade), `userId` (FK no cascade), `role` enum (`OWNER`/`ADMIN`/`COACH`), `invitedBy`, `status` (pending/active/removed), UNIQUE (academyId, userId), timestamps.
- Invitación por email: `POST /api/academies/[id]/members/invite` — crea usuario TEMPORARY si no existe (reutilizando patrón G4 de password generado) o reutiliza usuario existente; `POST /api/academies/[id]/members/[userId]/accept` para aceptar.
- Un profesor puede pertenecer a N academias (UNIQUE por par, sin restricción de una sola).
- `GET /api/academies/[id]/members` (listar), `DELETE /api/academies/[id]/members/[userId]` (remover, soft).
- **Decisión de roles (validar con @architect/@auth-security)**: mantener `user_role` global USER/ADMIN intacto y agregar rol por academia en `academy_memberships`. El ADMIN global (coach actual) puede crear academias y es OWNER de la primera. No se introduce `ADMIN_ACADEMIA` en `user_role` para no romper guards existentes.

### RF-03 — Librería de Rúbricas Institucionales
- Cambio aditivo en `rubrics`: `academyId` (nullable FK academies set null) + `scope` enum (`personal`/`institutional`, default `personal`).
- ADMIN/OWNER de academia crea rúbricas con `scope: institutional`; quedan visibles para todos los miembros COACH de esa academia.
- COACH puede **usar** (asignar a curso, evaluar) rúbricas institucionales pero **no** editar/archivar su estructura (descriptores/criterios/niveles). Guard: mutación de rúbrica institucional solo por OWNER/ADMIN de la academia.
- Endpoints: `GET /api/academies/[id]/rubrics` (listar institucionales), `POST /api/academies/[id]/rubrics` (crear institucional, OWNER/ADMIN), reutilizar `PUT/DELETE /api/rubrics/[id]` con guard extendido.

### RF-04 — Exportación PDF con Branding
- Endpoint `GET /api/evaluations/[id]/pdf` (guardUser + ACTIVE): genera PDF de la evaluación publicada con:
  - Logo de la academia (si la evaluación tiene curso con academia o el profesor pertenece a una) + color primario en header/footer.
  - Gráfico radar de las 6 dimensiones (`rubric_category`: reglas, tecnica_basica, tecnica_especifica, tactica, fisica, actitud_equipo) con los scores de la evaluación.
  - Datos del alumno, profesor (firma), fecha, versión, totalScore/maxScore, comentario global y tabla de scores por criterio.
- Dependencia nueva de PDF a decidir por @architect (recomendado: `@react-pdf/renderer` server-side; alternativa `pdf-lib`).
- Botón "Exportar PDF" en detalle de evaluación (coach y alumno).

## Acceptance Criteria

- **AC-01**: Un ADMIN global puede crear una academia con nombre, slug único y color HEX válido; el slug duplicado devuelve 409 y el color inválido 400. (RF-01)
- **AC-02**: Un ADMIN/OWNER puede subir logo SVG/PNG ≤2MB; archivos >2MB o MIME no permitido devuelven 400 y no se persisten. (RF-01)
- **AC-03**: Un COACH invitado por email a una academia puede aceptar la invitación y aparece en la lista de miembros; el mismo email invitado a 2 academias distintas genera 2 membresías independientes (multi-academia). (RF-02)
- **AC-04**: Un COACH puede asignar y usar una rúbrica institucional en evaluaciones, pero recibe 403 al intentar PUT/DELETE sobre ella; el OWNER/ADMIN de la academia sí puede editarla. (RF-03)
- **AC-05**: `GET /api/evaluations/[id]/pdf` devuelve un PDF válido (content-type `application/pdf`) con logo y color de la academia y radar de 6 dimensiones; sin academia asignada, genera PDF con branding neutro. (RF-04)
- **AC-06**: Toda mutación (crear academia, editar branding, invitar/remover miembro, crear/editar rúbrica institucional) queda registrada en `audit_logs`. (transversal)
- **AC-07 (tests)**: Unit tests (Jest) para schemas Zod, lógica de membresías y guard de rúbrica institucional; API tests (Playwright) con happy-path SQL real contra NeonDB para cada endpoint nuevo (academias, members, rubrics institucionales, pdf) + guards 401/403; E2E (Playwright) mínimo 1 flujo navegable (crear academia → invitar profesor → crear rúbrica institucional → exportar PDF). API docs actualizadas en `lib/api-docs/spec.ts`.

## Edge Cases

- **Slug colisión**: retry no aplica (slug es elegido por el usuario) → 409 con mensaje claro.
- **Logo inválido**: SVG con contenido malicioso (script) — validar MIME real + sanitizar; PNG con dimensiones excesivas — limitar dimensiones máx (ej. 1024×1024).
- **Academia archivada**: miembros no pueden operar; evaluaciones históricas intactas (FK sin cascade).
- **Remover OWNER**: no se permite remover/archivar al último OWNER (400); transferencia de ownership out-of-scope.
- **Profesor sin academia**: sigue operando como hoy (rúbricas personales, sin branding) — retrocompatibilidad total.
- **Evaluación sin academia**: PDF con branding neutro (logo/color default del sistema).
- **Rúbrica institucional con evaluaciones**: edición de estructura bloqueada para COACH; OWNER/ADMIN puede editar pero los scores históricos quedan protegidos (FK sin cascade, patrón existente).
- **Invitación a email ya registrado**: no duplicar usuario; crear membresía pending y notificar vía inbox (trigger `academy.invite`).
- **PDF de evaluación draft**: 400 (solo publicadas exportables).
- **Anti-IDOR**: toda query filtra por academyId/membership del usuario; recurso ajeno → 404.

## Dependencias

- **DB**: migración nueva (tablas `academies`, `academy_memberships`, enums `academy_membership_role`, `rubric_scope`; columnas `rubrics.academyId`, `rubrics.scope`) vía `pnpm run db:generate`.
- **Auth**: guards nuevos `guardAcademyOwner`/`guardAcademyAdmin`/`guardAcademyCoach` en `lib/auth/`; decisión de roles multi-academia (ver RF-02).
- **Storage**: mecanismo de upload de logo (decisión @architect — recomendado filesystem local en `public/uploads/`).
- **PDF**: librería nueva (decisión @architect — recomendado `@react-pdf/renderer`).
- **Notificaciones**: trigger `academy.invite` en `lib/notifications/triggers.ts` (reutiliza engine existente).
- **API docs**: `lib/api-docs/spec.ts` + paths/schemas nuevos (academies, members, rubrics institucionales, pdf).

## Out-of-scope

- Facturación/planes por academia (billing).
- Multi-tenant de datos completo (aislamiento total por academia de alumnos/cursos/evaluaciones) — esta iteración solo agrega academia + membresías + rúbricas institucionales + branding PDF; alumnos/cursos siguen siendo del coach.
- Transferencia de ownership de academia.
- Edición de branding en PDF por template (solo logo + color primario).
- Portal público por academia (subdominios/slugs públicos).
- Roles `ADMIN_ACADEMIA`/`COACH_ACADEMIA` en `user_role` global (se usa membresía por academia).
- Importación/exportación CSV de miembros.

## Agentes requeridos (orden sugerido)

1. @architect — technical-design + change-map (decide storage logo, librería PDF, contrato de roles).
2. @db-engineer — schema + migración + queries + unit tests.
3. @auth-security — guards de academia + invitación + auditoría + auth-impact.
4. @app-engineer — endpoints academias/members/rubrics/pdf + UI + API docs.
5. @ponytail-reviewer — revisión de simplicidad.
6. @qa-release — E2E + test-matrix + release-report.