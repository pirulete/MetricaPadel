/**
 * Protected Routes Configuration
 *
 * Define qué guard usa cada endpoint y qué estados de usuario admite.
 * REFERENCIA para implementación de route handlers — no es un middleware automático.
 *
 * Estados de usuario: TEMPORARY, ACTIVE, LOCKED
 * Principio: NUNCA permitir LOCKED. TEMPORARY solo si explícitamente declarado.
 *
 * Guards disponibles:
 *   - guardUser(session)    → 401 si no autenticado
 *   - guardAdmin(session)   → 401/403 si no ADMIN/SUPER_ADMIN+ACTIVE (jerarquía)
 *   - guardSuperAdmin(session) → 401/403 si no SUPER_ADMIN+ACTIVE (async, null = OK)
 *   - guardAcademyOwner(session, academyId)   → DB-backed, solo OWNER (SPEC-EPIC-01)
 *   - guardAcademyAdmin(session, academyId)   → DB-backed, OWNER o ADMIN
 *   - guardAcademyCoach(session, academyId)   → DB-backed, OWNER/ADMIN/COACH activos
 *   - worker-secret (header `x-worker-secret`) → solo endpoints internos sin
 *     sesión (p.ej. /api/internal/tournament-worker). sha256 + timingSafeEqual;
 *     401 sin header, 503 fail-closed si el secreto no está configurado.
 *
 * Guards de academia (lib/auth/academy-guard.ts):
 *   - Son async: `Promise<NextResponse | null>` (null = OK).
 *   - Consultan academy_memberships (rol por academia) + status de academies en
 *     cada request — nunca confían en claims del JWT para el rol de academia.
 *   - Anti-IDOR: membresía inexistente o academia archivada → 404 (no 403).
 *   - user_role global (USER/ADMIN) intacto; NUNCA LOCKED; TEMPORARY → 403.
 */

export const routeProtection = {
  // ─── PRIVATE (USER) ─────────────────────────────────────────────
  'GET /api/user/profile': {
    guard: 'guardUser',
    allowedStatuses: ['TEMPORARY', 'ACTIVE'],
    description: 'Lee el perfil propio',
  },
  'PUT /api/user/profile': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Actualiza el perfil propio',
  },

  // ─── ADMIN ──────────────────────────────────────────────────────
  'GET /api/admin/users': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista usuarios',
  },
  'POST /api/admin/users': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea usuario jugador (USER, status=ACTIVE sin verificación de email; 409 si email duplicado)',
    audit: 'auditCreate(user)',
  },
  'GET /api/admin/users/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Detalle de jugador (solo role USER; 404 si no existe o no es USER)',
  },
  'POST /api/admin/users/[id]/promote': {
    guard: 'guardSuperAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['SUPER_ADMIN'],
    description: 'Promueve jugador a ADMIN (query filtra role USER: self-promote y ya-ADMIN → null → 404 idempotente; anti-IDOR). Breaking intencional: ADMIN ya no promueve (AC-01)',
    audit: 'auditAdminPromoted (ADMIN_PROMOTED)',
  },
  'POST /api/admin/users/[id]/demote': {
    guard: 'guardSuperAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['SUPER_ADMIN'],
    description: 'Demota ADMIN → USER (400 si target USER, SUPER_ADMIN o self; 404 si inexistente; defensa último SUPER_ADMIN)',
    audit: 'auditAdminDemoted (ADMIN_DEMOTED)',
  },
  'GET /api/admin/admins': {
    guard: 'guardSuperAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['SUPER_ADMIN'],
    description: 'Lista admins (role IN ADMIN/SUPER_ADMIN) con ?search= ILIKE por nombre/email',
  },
  'GET /api/admin/audit-logs': {
    guard: 'guardSuperAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['SUPER_ADMIN'],
    description: 'Audit logs paginados (?actionType=&userId=&page=&pageSize≤100). Lectura, sin auditoría',
  },
  'GET /api/admin/academies': {
    guard: 'guardSuperAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['SUPER_ADMIN'],
    description: 'Lista TODAS las academias con métricas (memberCount/rubricCount) — visibilidad global de plataforma',
  },

  // ─── ADMIN MARKETING (CMS) ─────────────────────────────────────
  'GET /api/admin/marketing/pages': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista páginas de marketing (todos los status)',
  },
  'POST /api/admin/marketing/pages': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea página de marketing',
    audit: 'auditCreate(marketing_page)',
  },
  'GET /api/admin/marketing/pages/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lee página + secciones (incluye draft)',
  },
  'PATCH /api/admin/marketing/pages/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza página (slug/título/status)',
    audit: 'auditUpdate(marketing_page)',
  },
  'DELETE /api/admin/marketing/pages/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina página',
    audit: 'auditDelete(marketing_page)',
  },
  'POST /api/admin/marketing/pages/[id]/sections': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea sección en página',
    audit: 'auditCreate(marketing_section)',
  },
  'PATCH /api/admin/marketing/pages/[id]/sections/[sectionId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza sección (blockType/config)',
    audit: 'auditUpdate(marketing_section)',
  },
  'DELETE /api/admin/marketing/pages/[id]/sections/[sectionId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina sección',
    audit: 'auditDelete(marketing_section)',
  },
  'PUT /api/admin/marketing/pages/[id]/sections/reorder': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Reordena secciones de página',
    audit: 'auditUpdate(marketing_page, sortOrders)',
  },
  'GET /api/admin/marketing/blog': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista posts (todos los status)',
  },
  'POST /api/admin/marketing/blog': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea post',
    audit: 'auditCreate(marketing_post)',
  },
  'PATCH /api/admin/marketing/blog/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza post (incluye publish/unpublish)',
    audit: 'auditUpdate(marketing_post)',
  },
  'DELETE /api/admin/marketing/blog/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina post',
    audit: 'auditDelete(marketing_post)',
  },
  'GET /api/admin/marketing/products': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista productos (todos los status)',
  },
  'POST /api/admin/marketing/products': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea producto',
    audit: 'auditCreate(marketing_product)',
  },
  'PATCH /api/admin/marketing/products/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza producto',
    audit: 'auditUpdate(marketing_product)',
  },
  'DELETE /api/admin/marketing/products/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina producto',
    audit: 'auditDelete(marketing_product)',
  },
  'GET /api/admin/marketing/categories': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista categorías con productCount',
  },
  'POST /api/admin/marketing/categories': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea categoría',
    audit: 'auditCreate(marketing_category)',
  },
  'PATCH /api/admin/marketing/categories/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza categoría',
    audit: 'auditUpdate(marketing_category)',
  },
  'DELETE /api/admin/marketing/categories/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina categoría (FK SET NULL)',
    audit: 'auditDelete(marketing_category)',
  },
  'GET /api/admin/marketing/settings': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lee settings globales',
  },
  'PATCH /api/admin/marketing/settings': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Upsert settings (siteName/nav/footer)',
    audit: 'auditUpdate(marketing_setting) por key',
  },
  'POST /api/admin/marketing/revalidate': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Invalidación manual de tags de caché',
    audit: 'auditAdminAction(REVALIDATE)',
  },

  // ─── PADEL EVALUATIVO — Rúbricas (coach/ADMIN) ─────────────────
  'GET /api/rubrics': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista rúbricas del coach (owner) por status',
  },
  'POST /api/rubrics': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea rúbrica con levels/criteria/descriptors (owner)',
    audit: 'auditCreate(rubric)',
  },
  'GET /api/rubrics/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lee rúbrica + niveles/criterios/descriptores (owner, 404 si ajeno)',
  },
  'PUT /api/rubrics/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza rúbrica (reemplazo completo de criteria/descriptors) (owner)',
    audit: 'auditUpdate(rubric)',
  },
  'DELETE /api/rubrics/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Archiva rúbrica (soft, status=archived) (owner)',
    audit: 'auditDelete(rubric, archive)',
  },

  // ─── PADEL EVALUATIVO — Evaluaciones (coach/ADMIN) ────────────
  'GET /api/evaluations': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista evaluaciones del coach (teacherId=owner) por status',
  },
  'POST /api/evaluations': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea borrador de evaluación (teacherId=owner)',
    audit: 'auditCreate(evaluation)',
  },
  'GET /api/evaluations/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lee evaluación + scores (teacherId=owner, 404 si ajeno)',
  },
  'PUT /api/evaluations/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Guarda scores/globalComment en borrador (teacherId=owner)',
    audit: 'auditUpdate(evaluation)',
  },
  'POST /api/evaluations/[id]/publish': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Publica evaluación validando criterios completos (teacherId=owner)',
    audit: 'auditUpdate(evaluation, publish)',
  },

  // ─── PADEL EVALUATIVO — Alumno (USER, ownership estricto) ─────
  'GET /api/student/evaluations': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Lista evaluaciones publicadas del alumno (studentId=owner)',
  },
  'GET /api/student/evaluations/[id]': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Lee evaluación publicada propia (studentId=owner, 404 si ajeno)',
  },
  'POST /api/student/evaluations/[id]/read': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Marca evaluación como leída (idempotente, studentId=owner)',
  },

  // ─── PADEL EVALUATIVO — Cursos (coach/ADMIN, ownership ownerId) ─
  'GET /api/courses': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista cursos del coach (ownerId=me, anti-IDOR)',
  },
  'POST /api/courses': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea curso con inviteCode generado (ownerId=me)',
    audit: 'auditCreate(course)',
  },
  'GET /api/courses/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Detalle de curso + students + rubrics (ownerId=me, 404 si ajeno)',
  },
  'PUT /api/courses/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza curso (ownerId=me, 404 si ajeno)',
    audit: 'auditUpdate(course)',
  },
  'DELETE /api/courses/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Archiva curso (soft, status=archived; enrollments/rubrics se conservan) (ownerId=me)',
    audit: 'auditDelete(course, archive)',
  },
  'POST /api/courses/[id]/rubrics': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Asigna rúbrica activa propia al curso (ownerId=me; 404 si curso/rúbrica ajenos; 409 si ya asignada)',
    audit: 'auditCreate(course_rubric)',
  },
  'GET /api/courses/[id]/rubrics': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista rúbricas asignadas al curso (ownerId=me, 404 si ajeno)',
  },

  // ─── PADEL EVALUATIVO — Join (alumno/USER) ────────────────────
  'POST /api/courses/join': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Inscribe alumno por inviteCode (case-insensitive; 400 si coach se une a su propio curso; 404 código inválido/archivado; 409 ya inscrito)',
    audit: 'auditCreate(course_enrollment)',
  },
  'DELETE /api/courses/[id]/enrollment': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Auto-desinscripción del alumno (role USER obligatorio → ADMIN/coach 403; query filtra studentId=me → no inscrito/curso ajeno 404; doble DELETE 404)',
    audit: 'auditDelete(course_enrollment)',
  },

  // ─── PADEL EVALUATIVO — Dashboard (derivado por rol) ───────────
  'GET /api/dashboard/teacher': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Métricas del coach (students/evaluations/average/classesToday) + cursos propios',
  },
  'GET /api/dashboard/student': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Nivel + cursos del alumno + últimas 5 notificaciones del inbox',
  },

  // ─── PADEL EVALUATIVO — Historial (coach/ADMIN, teacherId) ─────
  'GET /api/history': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Historial de evaluaciones del coach (teacherId=me; filtros courseId/studentId/status; anti-IDOR)',
  },

  // ─── PADEL EVALUATIVO — Transiciones (coach/ADMIN) ─────────────
  // Ownership por `coach_transitions.owner_id` (de sesión, nunca del cliente).
  // Recurso ajeno o inexistente → 404 (anti-IDOR, sin oráculo de existencia).
  'GET /api/transitions': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista transiciones del coach (ownerId=me, paginación por cursor updatedAt, anti-IDOR)',
  },
  'POST /api/transitions': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea transición (ownerId=me; scenario jsonb { initialStepIndex, steps })',
    audit: 'auditCreate(coach_transition)',
  },
  'GET /api/transitions/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lee transición completa (ownerId=me; 404 si ajena/inexistente)',
  },
  'PUT /api/transitions/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Reemplazo completo de title+scenario (ownerId=me; 404 si ajena; last-write-wins)',
    audit: 'auditUpdate(coach_transition)',
  },
  'DELETE /api/transitions/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Hard delete por owner (ownerId=me; 404 si ajena/inexistente; audit_logs conserva el rastro)',
    audit: 'auditDelete(coach_transition)',
  },

  // ─── PADEL EVALUATIVO — Agenda de clases (v0.11, A1–A12) ───────
  // Patrón obligatorio: guardAdmin → getCourseOwned(session.user.id, id) →
  // null = 404 (anti-IDOR, sin oráculo de existencia) → curso archivado en
  // operación de escritura = 409 AGENDA_COURSE_ARCHIVED (A1 y A6 son lectura
  // y sí permiten curso archivado). `antiIdor` documenta la clave de ownership.
  'GET /api/courses/[id]/agenda/slots': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista la plantilla semanal de slots del curso (A1; lectura, permite curso archivado)',
    antiIdor: 'getCourseOwned(ownerId=me, id) → 404 si ajeno',
  },
  'POST /api/courses/[id]/agenda/slots': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea slot semanal (A2; 409 AGENDA_SLOT_DUPLICATE; 409 AGENDA_COURSE_ARCHIVED si archivado)',
    antiIdor: 'getCourseOwned(ownerId=me, id) → 404 si ajeno',
    audit: 'auditCreate(weekly_slot)',
  },
  'PUT /api/courses/[id]/agenda/slots/[slotId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza slot semanal (A3; ≥1 campo; 409 duplicado; 409 AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + slot filtrado por courseId → 404 si ajeno',
    audit: 'auditUpdate(weekly_slot)',
  },
  'DELETE /api/courses/[id]/agenda/slots/[slotId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Elimina slot semanal y desvincula bloques (detachedBlocks) (A4; 404 si ajeno; 409 AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + slot filtrado por courseId → 404 si ajeno',
    audit: 'auditDelete(weekly_slot)',
  },
  'POST /api/courses/[id]/agenda/weeks': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Materializa la semana desde la plantilla, idempotente en tx (A5; 409 AGENDA_NO_SLOTS sin escritura; 409 AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) → 404 si ajeno',
    audit: 'auditCreate(class_block_week)',
  },
  'GET /api/courses/[id]/agenda/blocks': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista bloques por rango (A6; default semana actual, máximo 8 semanas; lectura, permite archivar)',
    antiIdor: 'getCourseOwned(ownerId=me, id) → 404 si ajeno',
  },
  'POST /api/courses/[id]/agenda/blocks': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea bloque suelto (A7; 409 duplicado si slot+fecha ya existe; 409 AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) → 404 si ajeno',
    audit: 'auditCreate(class_block)',
  },
  'GET /api/courses/[id]/agenda/blocks/[blockId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Detalle del bloque + inscripciones con alumno (A8; lectura, permite archivar; hidrata el sheet al reabrir)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + bloque filtrado por courseId → 404 si ajeno',
  },
  'PUT /api/courses/[id]/agenda/blocks/[blockId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Actualiza bloque; status=cancelled arrastra inscripciones y notifica (A8; 409 AGENDA_BLOCK_PAST / AGENDA_BLOCK_CANCELLED / AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + bloque filtrado por courseId → 404 si ajeno',
    audit: 'auditUpdate(class_block) + auditUpdate(class_block, cancelled)',
  },
  'DELETE /api/courses/[id]/agenda/blocks/[blockId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Borra bloque (A9; 409 AGENDA_BLOCK_HAS_ENROLLMENTS si tiene inscripciones → usar cancelación; 409 AGENDA_COURSE_ARCHIVED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + bloque filtrado por courseId → 404 si ajeno',
    audit: 'auditDelete(class_block)',
  },
  'POST /api/courses/[id]/agenda/blocks/[blockId]/enrollments': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Asigna alumnos al bloque all-or-nothing (A10; 400 AGENDA_STUDENT_NOT_ENROLLED, 409 AGENDA_CAPACITY / AGENDA_BLOCK_CANCELLED; notifica `assigned` solo a los insertados)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + assignStudents valida course_enrollments del curso → 404 si ajeno',
    audit: 'auditCreate(block_enrollment)',
  },
  'PUT /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Marca asistencia tri-estado + notas (A11; 404 si la inscripción no existe; 409 AGENDA_BLOCK_CANCELLED)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + updateAttendance scoped por courseId/blockId/studentId → 404 si ajeno',
    audit: 'auditUpdate(block_enrollment)',
  },
  'DELETE /api/courses/[id]/agenda/blocks/[blockId]/enrollments/[studentId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Quita alumno del bloque (A12; 404 si el bloque o la inscripción no existen; notifica `removed` solo tras borrado efectivo)',
    antiIdor: 'getCourseOwned(ownerId=me, id) + removeEnrollment scoped por courseId/blockId/studentId → 404 si ajeno',
    audit: 'auditDelete(block_enrollment)',
  },

  // ─── PADEL EVALUATIVO — Agenda del alumno (U1–U2, USER) ────────
  // Anti-IDOR: alcance = `course_enrollments(studentId=me)` (INNER JOIN).
  // `?courseId` no inscrito → 404. Sin bypass SUPER_ADMIN (D9).
  'GET /api/student/agenda': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Próximas clases propias + agregados de asistencia + todayIso (U1; limit default 5; ?courseId no inscrito ⇒ 404)',
    antiIdor: 'INNER JOIN course_enrollments(studentId=me) → ?courseId ajeno 404',
  },
  'GET /api/student/agenda/history': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Historial de clases propias pasadas/canceladas con cursor compuesto (U2; cursor YYYY-MM-DDTHH:mm; ?courseId no inscrito ⇒ 404)',
    antiIdor: 'INNER JOIN course_enrollments(studentId=me) → ?courseId ajeno 404',
  },

  // ─── ACADEMIA (SPEC-EPIC-01, Fase B) — RBAC por academia ───────
  // Guards DB-backed: guardAcademyOwner / guardAcademyAdmin / guardAcademyCoach.
  // Anti-IDOR: membresía inexistente o academia archivada → 404 (no 403).
  'GET /api/academies': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Lista academias del usuario (membresías activas)',
  },
  'POST /api/academies': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Crea academia (ownerId=me; inserta OWNER en academy_memberships; 409 slug duplicado)',
    audit: 'auditAcademyCreated(academies)',
  },
  'GET /api/academies/[id]': {
    guard: 'guardAcademyCoach',
    allowedStatuses: ['ACTIVE'],
    description: 'Detalle de academia + myRole (membresía activa; 404 si ajeno/archivada)',
  },
  'PUT /api/academies/[id]': {
    guard: 'guardAcademyAdmin',
    allowedStatuses: ['ACTIVE'],
    description: 'Actualiza branding (name/slug/primaryColor) — OWNER/ADMIN; 409 slug duplicado',
    audit: 'auditAcademyUpdated(academies)',
  },
  'DELETE /api/academies/[id]': {
    guard: 'guardAcademyOwner',
    allowedStatuses: ['ACTIVE'],
    description: 'Archiva academia (soft, status=archived) — solo OWNER',
    audit: 'auditAcademyArchived(academies)',
  },
  'POST /api/academies/[id]/logo': {
    guard: 'guardAcademyAdmin',
    allowedStatuses: ['ACTIVE'],
    description: 'Upload de logo (multipart, PNG/SVG ≤2MB, dims ≤1024, SVG sanitizado) — OWNER/ADMIN',
    audit: 'auditAcademyUpdated(academies, logo)',
  },
  'POST /api/academies/[id]/members/invite': {
    guard: 'guardAcademyAdmin',
    allowedStatuses: ['ACTIVE'],
    description: 'Invita miembro por email (OWNER/ADMIN; crea usuario TEMPORARY si no existe; 409 ya miembro)',
    audit: 'auditMemberInvited(academy_memberships)',
  },
  'POST /api/academies/[id]/members/[userId]/accept': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Acepta invitación (solo self: userId=sesión; marca active; 404 si no existe/removida)',
    audit: 'auditUpdate(academy_memberships)',
  },
  'GET /api/academies/[id]/members': {
    guard: 'guardAcademyCoach',
    allowedStatuses: ['ACTIVE'],
    description: 'Lista miembros con info de usuario (membresía activa)',
  },
  'DELETE /api/academies/[id]/members/[userId]': {
    guard: 'guardAcademyAdmin',
    allowedStatuses: ['ACTIVE'],
    description: 'Remueve miembro (soft, status=removed) — OWNER/ADMIN; 400 si último OWNER',
    audit: 'auditMemberRemoved(academy_memberships)',
  },
  'GET /api/academies/[id]/rubrics': {
    guard: 'guardAcademyCoach',
    allowedStatuses: ['ACTIVE'],
    description: 'Lista rúbricas institucionales de la academia (scope=institutional)',
  },
  'POST /api/academies/[id]/rubrics': {
    guard: 'guardAcademyAdmin',
    allowedStatuses: ['ACTIVE'],
    description: 'Crea rúbrica institucional (scope forzado institutional, academyId=ruta) — OWNER/ADMIN',
    audit: 'auditCreate(rubric, institutional)',
  },
  'GET /api/evaluations/[id]/pdf': {
    guard: 'guardUser',
    allowedStatuses: ['ACTIVE'],
    description: 'Exporta PDF con branding de academia (teacher o student de la evaluación; 400 si draft; 404 si ajeno)',
  },

  // ─── TORNEOS (v0.12, M1) — motor de agenda ─────────────────────
  // Patrón: guardAdmin → query con `ownerId=me` → null = 404 (anti-IDOR, sin
  // oráculo de existencia) → torneo archivado en escritura = 409. El worker
  // interno NO usa guardAdmin: se autentica por secreto compartido (sin sesión,
  // los estados USER no aplican).
  'GET /api/torneos': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Lista torneos del coach (ownerId=me, paginación por cursor updatedAt, anti-IDOR)',
    antiIdor: 'listTournaments(ownerId=me)',
  },
  'POST /api/torneos': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Importa el JSON canónico del torneo (1 transacción; 400 forma/reglas, 422 R0/R6, 201 counts)',
    antiIdor: 'importTournament(ownerId=me) — ownerId de la sesión, nunca del body',
    audit: 'auditCreate(tournament)',
  },
  'GET /api/torneos/[id]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Detalle del torneo + counts + bloques + activeRun/currentRun (dispara reaper perezoso idempotente)',
    antiIdor: 'getTournamentDetail(id, ownerId=me) → 404 si ajeno/inexistente',
  },
  'GET /api/torneos/[id]/instancia': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Espejo canónico de la instancia reconstruida desde DB (exportar-corregir-reimportar)',
    antiIdor: 'buildInstance(id, ownerId=me) → 404 si ajeno/inexistente',
  },
  'POST /api/torneos/[id]/agenda': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Encola la generación de agenda (202; 404 ajeno; 409 archived/run_active; 422 infeasible_occupancy sin crear run; timeLimitMs clampa server-side)',
    antiIdor: 'getTournamentById(id, ownerId=me) + buildInstance(id, ownerId=me) → 404 si ajeno',
    audit: 'auditCreate(tournament_run)',
  },
  'GET /api/torneos/[id]/runs/[runId]': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Polling del run (estado/métricas/diagnóstico; ?include=slots); reaper perezoso + re-despacho ≤2',
    antiIdor: 'getTournamentById(id, ownerId=me) + getRun(runId, { tournamentId }) → 404 si ajeno',
  },
  'POST /api/torneos/[id]/archive': {
    guard: 'guardAdmin',
    allowedStatuses: ['ACTIVE'],
    roles: ['ADMIN'],
    description: 'Archiva torneo (soft, status=archived; 409 already_archived; nunca DELETE)',
    antiIdor: 'getTournamentById(id, ownerId=me) + archiveTournament(id, ownerId=me) → 404 si ajeno',
    audit: 'auditUpdate(tournament)',
  },
  'POST /api/internal/tournament-worker': {
    guard: 'worker-secret',
    auth: 'x-worker-secret',
    allowedStatuses: [],
    roles: [],
    description: 'Worker interno del motor (sin sesión ni cookies): secreto TOURNAMENT_WORKER_SECRET vía sha256+timingSafeEqual; sin header 401; secreto no configurado 503 worker_not_configured (fail-closed); claim atómico queued→running (409 not_claimed). maxDuration=300',
    antiIdor: 'No aplica: no expone datos del torneo, solo el runId reclamado',
  },
} as const

export type RouteKey = keyof typeof routeProtection
