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
 *   - guardAdmin(session)   → 401/403 si no ADMIN+ACTIVE
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
} as const

export type RouteKey = keyof typeof routeProtection
