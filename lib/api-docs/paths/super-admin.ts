/**
 * Paths OpenAPI de Super Admin (plataforma): demote, admins, audit-logs y academias globales.
 * El promote modificado vive en paths/padel.ts (misma ruta, guard actualizado).
 */
export const superAdminTags = {
  name: 'Super Admin',
  description: 'Endpoints exclusivos de SUPER_ADMIN (guardSuperAdmin): gestión de admins, auditoría y academias globales',
};

export const superAdminPaths = {
  '/api/admin/users/{id}/demote': {
    post: {
      tags: ['Super Admin'],
      summary: 'Demotar ADMIN a USER',
      description: 'Cambia users.role ADMIN→USER. Exclusivo de SUPER_ADMIN. Reglas: target USER → 400; target SUPER_ADMIN → 400; self → 400; inexistente → 404. Transaccional (invariante último SUPER_ADMIN, D5). Audita ADMIN_DEMOTED.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Usuario demotado', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDto' } } } } } },
        '400': { description: 'Target USER/SUPER_ADMIN, self-demote o último SUPER_ADMIN' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
        '404': { description: 'Usuario no encontrado' },
      },
    },
  },
  '/api/admin/admins': {
    get: {
      tags: ['Super Admin'],
      summary: 'Listar admins (ADMIN + SUPER_ADMIN)',
      description: 'Lista usuarios con role ADMIN/SUPER_ADMIN. Exclusivo de SUPER_ADMIN. Query: ?search= (ILIKE por nombre/email). Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'search', in: 'query', required: false, schema: { type: 'string', maxLength: 100 } }],
      responses: {
        '200': { description: 'Lista de admins', content: { 'application/json': { schema: { type: 'object', properties: { admins: { type: 'array', items: { $ref: '#/components/schemas/AdminDto' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
      },
    },
  },
  '/api/admin/audit-logs': {
    get: {
      tags: ['Super Admin'],
      summary: 'Listar audit logs paginados',
      description: 'Lista audit_logs con usuario asociado. Exclusivo de SUPER_ADMIN. Query: ?page=&pageSize=&actionType=&userId=. Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1 } },
        { name: 'pageSize', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 100 } },
        { name: 'actionType', in: 'query', required: false, schema: { type: 'string', maxLength: 50 } },
        { name: 'userId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        '200': { description: 'Logs paginados', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuditLogsResponse' } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
      },
    },
  },
  '/api/admin/academies': {
    get: {
      tags: ['Super Admin'],
      summary: 'Listar todas las academias (global)',
      description: 'Lista TODAS las academias (activas y archivadas) con owner y métricas (memberCount, rubricCount). Visibilidad global de plataforma (D6). Exclusivo de SUPER_ADMIN. Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de academias', content: { 'application/json': { schema: { type: 'object', properties: { academies: { type: 'array', items: { $ref: '#/components/schemas/AcademyGlobalDto' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
      },
    },
  },
};