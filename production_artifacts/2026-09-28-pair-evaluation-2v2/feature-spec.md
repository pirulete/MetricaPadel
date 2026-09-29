# SPEC-01 — Evaluación Eficiente de Parejas en Cancha (2v2)

> status: proposed
> release: v0.8
> date: 2026-09-28
> change_id: pair-evaluation-2v2
> module: dashboard+api+db+ui
> tags: [padel, evaluation, pair, scoring, ui, api, db, audit, transaction]

## Problema

Evaluar individualmente a 4 alumnos en una clase de pádel de 60 minutos consume demasiado tiempo. Al ser un deporte de pareja, los criterios tácticos y de actitud son compartidos por la dupla: el profesor termina marcando el mismo nivel dos veces (una por alumno) en cada criterio de `tactica` y `actitud_equipo`. Hoy el `ScoringCanvas` (`components/padel/scoring-canvas.tsx`) solo soporta evaluación 1v1: un único `studentId` en estado, un `StudentPicker` single-select y un solo registro en `evaluations` por publicación. No existe ningún modo "pareja" en el código (verificado en FEATURES.md — sin entradas previas; `student-picker.tsx` expone `onChange: (studentId: string | null) => void`).

## Objetivo

Permitir al profesor evaluar a una dupla (2 alumnos) en una sola pantalla: los criterios de dimensión `tactica` y `actitud_equipo` se sincronizan con un toque (conmutador "Evaluar en Pareja" activado por defecto), los criterios de `tecnica_basica`, `tecnica_especifica` y `fisica` se capturan por columna (Alumno A / Alumno B), y al publicar se crean **dos registros independientes e inmutables** en `evaluations`, cada uno con su versión `v{N}` propia. El historial del alumno permanece individual (RN-A3: las evaluaciones pertenecen al alumno, no al curso).

## Alcance

### In-Scope

- **RF-01 — Selector de Dupla**: en la vista de evaluación de un curso, el profesor selecciona 2 alumnos (Alumno A / Alumno B) para iniciar "Evaluación en Pareja". Reutiliza `student-picker.tsx` (o un wrapper `pair-student-picker`) con validación de 2 selecciones distintas.
- **RF-02 — Sincronización de Criterios Categóricos**: en `ScoringCanvas`, los criterios de dimensión `tactica` y `actitud_equipo` muestran un conmutador "Evaluar en Pareja" activado por defecto. Al tocar un nivel en estas dimensiones, el nivel se asigna a ambos alumnos en tiempo real.
- **RF-03 — Desglose Individual**: los criterios de `tecnica_basica`, `tecnica_especifica` y `fisica` se muestran en dos columnas (Alumno A / Alumno B) en la misma pantalla, sin sincronización.
- **RF-04 — Persistencia Ciega**: al presionar "Publicar", se crean 2 registros independientes en `evaluations` dentro de una **transacción** (2 inserts atómicos), asignando a cada alumno su versión `v{N}` correspondiente (cómputo `MAX(version)+1` por `(studentId, rubricId)` publicado, reutilizando `publishEvaluation`).
- **RF-05 — Evento de Auditoría**: registro `pair_evaluation_published` en `audit_logs` con payload de analytics:
  ```json
  {
    "coach_id": "uuid",
    "course_id": "uuid",
    "student_a_id": "uuid",
    "student_b_id": "uuid",
    "shared_criteria_count": 3,
    "individual_criteria_count": 3,
    "duration_seconds": 84
  }
  ```
- **RF-06 — Guardado de borrador en pareja**: persistir ambos borradores (drafts, `version = null`) al guardar en modo pareja, con rollback transaccional si falla uno.

### Out-of-Scope

- **2v2 completo (4 alumnos en una pantalla)**: esta iteración soporta 1 dupla (2 alumnos) por pantalla. El 3º/4º alumno se evalúa en otra sesión (individual o en otra dupla).
- **Registro único compartido en `evaluations`**: NO se crea una evaluación "de pareja" — siempre 2 registros independientes (RN-A1).
- **PDF de pareja combinado**: el PDF existente (`GET /api/evaluations/[id]/pdf`) sigue funcionando por evaluación individual; no se genera un PDF conjunto en esta iteración.
- **Notificaciones a alumnos al publicar en pareja**: los triggers existentes no cambian.
- **Analytics dashboard de métricas de pareja**: solo se registra el evento de auditoría con payload; no hay UI de reportes.
- **Cambios en `rubric_category`**: el enum ya tiene las 6 dimensiones; no se agregan dimensiones nuevas.

## Acceptance Criteria

- **CA-01 (Sincronización Táctica)**: Dado que el profesor evalúa a Alumno A y Alumno B en modalidad pareja, cuando selecciona el nivel "Bueno (3)" en un criterio de dimensión `tactica` o `actitud_equipo`, entonces el nivel "Bueno (3)" se marca visualmente para ambos alumnos en tiempo real (sin recargar).
- **CA-02 (Desvinculación Individual)**: Dado que el conmutador "Evaluar en Pareja" se desactiva manualmente para un criterio táctico, cuando el profesor selecciona un nivel para Alumno A, entonces el nivel de Alumno B en ese criterio permanece sin cambios.
- **CA-03 (Independencia Histórica)**: Dado que se publica una evaluación en pareja, cuando se consulta `GET /api/student/evaluations` para Alumno A, entonces la respuesta retorna únicamente el objeto de evaluación de Alumno A con su propio ID, su versión `v{N}` y su total score calculado (nunca el de Alumno B).
- **CA-04 (Persistencia Transaccional)**: Dado que se publica una evaluación en pareja, entonces se insertan exactamente 2 filas en `evaluations` (una por alumno) con `status = published`, `courseId` y `rubricId` correctos; si cualquiera de los 2 inserts falla, la transacción revierte y no queda ninguna fila parcial.
- **CA-05 (Versionado Independiente)**: Dado que Alumno A ya tiene 2 evaluaciones publicadas de la misma rúbrica y Alumno B ninguna, al publicar en pareja Alumno A recibe `version = 3` y Alumno B `version = 1`.
- **CA-06 (Auditoría con Analytics)**: Dado que se publica una evaluación en pareja, entonces se registra `pair_evaluation_published` en `audit_logs` con el payload completo (coach_id, course_id, student_a_id, student_b_id, shared_criteria_count, individual_criteria_count, duration_seconds).
- **CA-07 (Anti-IDOR en Dupla)**: Dado que el profesor intenta publicar en pareja con un alumno que NO está inscrito en el curso, entonces la API responde 404 (no 403) y no se crea ninguna evaluación.
- **CA-08 (Tests)**: La feature incluye unit tests (Jest) para la lógica de sincronización/desglose y la query transaccional de publicación en pareja; API tests (Playwright) con al menos 1 happy-path con SQL real contra NeonDB (2 filas creadas, versiones correctas, auditoría registrada) + guards 401/403/404; E2E (Playwright) del flujo navegable seleccionar dupla → sincronizar criterio → publicar.

## Edge Cases

- **3 alumnos en la clase**: el modo pareja requiere exactamente 2 alumnos seleccionados. Con 3, el profesor evalúa 1 dupla y el 3º individualmente (o en otra dupla). La UI no permite iniciar pareja con 1 o 3+ seleccionados (botón deshabilitado + mensaje).
- **Mismo alumno en A y B**: se rechaza en la UI y en el schema Zod (`studentAId !== studentBId` → 400).
- **Alumno con evaluación publicada previa**: no bloquea; el versionado es por alumno (CA-05). La dupla puede tener historiales de distinta longitud.
- **Alumno con borrador previo de la misma rúbrica**: al publicar en pareja, el borrador existente se actualiza a published (mismo patrón que 1v1) y la versión se computa sobre publicadas; no se duplica.
- **Conmutador desactivado a mitad de sesión**: desactiva la sincronización hacia adelante; los niveles ya sincronizados NO se revierten retroactivamente (documentado en UI con tooltip).
- **Dimensión `reglas`**: no está listada en RF-02/RF-03. **Decisión pendiente de validación técnica**: por defecto se propone tratarla como compartida (las reglas aplican a la pareja), pero debe confirmarse con el negocio. Si no se confirma, se trata como individual. (Se marca como decisión abierta en el technical design.)
- **Alumno removido del curso después de publicar**: `evaluations.courseId` es `onDelete: set null` (RN-A3) — el historial del alumno permanece intacto; la evaluación en pareja ya publicada no se ve afectada.
- **Fallo de red al publicar**: la transacción garantiza atomicidad; el cliente muestra error y permite reintentar sin duplicar (idempotencia por validación de borrador existente).
- **Duración de sesión**: `duration_seconds` se mide client-side desde el inicio de la sesión de evaluación hasta el publish; si el cliente no envía el valor, el servidor lo omite o usa 0 (decisión del technical design).

## Dependencias

- `lib/db/schema.ts` — tabla `evaluations` existente (sin cambios de esquema esperados; verificar si se necesita columna `pairId` — **decisión abierta**: NO se propone en esta iteración, la relación se infiere por auditoría; evaluar en technical design).
- `lib/db/queries/padel/evaluations.ts` — `publishEvaluation` (cómputo de versión) y nueva query transaccional `publishPairEvaluation`.
- `components/padel/scoring-canvas.tsx` — refactor a modo pareja (estado `studentAId`/`studentBId`, conmutador por criterio, columnas A/B).
- `components/padel/student-picker.tsx` — reutilización o wrapper para selección de dupla.
- `lib/padel/score.ts` — `computeTotalScore`/`validatePublish` reutilizados por alumno.
- `lib/validations/padel.ts` — schema Zod `pairEvaluationPublishSchema` (studentAId, studentBId, rubricId, courseId, scoresA, scoresB, durationSeconds).
- `lib/audit/helpers.ts` — nuevo evento `PAIR_EVALUATION_PUBLISHED`.
- `lib/api-docs/spec.ts` — documentar endpoint(s) de pareja.

## Riesgos

- **R1 — Complejidad de UI**: el ScoringCanvas pasa de 1 columna a 2 columnas + conmutadores por criterio. Mitigación: reutilizar componentes existentes, mantener modo 1v1 intacto (retrocompatibilidad), feature flag client-side si es necesario.
- **R2 — Atomicidad**: 2 inserts + auditoría deben ser transaccionales. Mitigación: `db.transaction` de Drizzle; tests de rollback.
- **R3 — Versionado**: el cómputo de versión por alumno debe hacerse dentro de la misma transacción para evitar carreras. Mitigación: reutilizar el patrón `COALESCE(MAX(version),0)+1` de `publishEvaluation` con lock de fila.
- **R4 — Cobertura**: refactor de `scoring-canvas.tsx` puede reducir cobertura del módulo. Mitigación: unit tests de la lógica de sincronización extraída a `lib/padel/pair.ts` (función pura) + mantener gate `--coverage`.

## Out-of-Scope Explícito (reiteración)

No se toca: auth/guards globales (solo se agrega validación de inscripción), esquema de `evaluations` (sin columna nueva salvo decisión del technical design), notificaciones, PDF conjunto, dashboard de métricas de pareja, modo 4 jugadores.

## Referencias

- `ARCHITECTURE.md` — Padel Evaluativo Core (v0.1), Evolución (v0.4), Academia (v0.6)
- `FEATURES.md` — entradas de evaluación (soft-delete G16, versionado G6, evolución G7)
- `production_artifacts/2026-09-28-roadmap/roadmap.md` — prioridades