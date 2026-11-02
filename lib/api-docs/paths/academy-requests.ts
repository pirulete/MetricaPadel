/**
 * Paths OpenAPI de Solicitudes de Acceso a Academia (v0.9).
 * Referencias a schemas en lib/api-docs/schemas/academy-requests.ts.
 */
export const academyRequestsTags = {
  name: 'Solicitudes de Acceso',
  description: 'Solicitudes de acceso a academia (join/create) — coach solicita, SUPER_ADMIN aprueba/rechaza',
};

export const academyRequestsPaths = {
  '/api/academy-requests': {
    post: {
      tags: ['Solicitudes de Acceso'],
      summary: 'Crear solicitud de acceso',
      description: 'guardAdmin (coach global, ACTIVE). Rate limit por IP (10/min, key academy-request:{ip}). join_academy: unirse a academia existente (rol ADMIN/COACH); create_academy: pedir que SUPER_ADMIN cree una academia (rol OWNER implícito). 404 academia inexistente (join), 400 archivada (join), 409 duplicado pendiente / ya miembro / slug existe. Audita REQUEST_CREATED.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AcademyRequestInput' } } } },
      responses: {
        '201': { description: 'Solicitud creada', content: { 'application/json': { schema: { type: 'object', properties: { request: { $ref: '#/components/schemas/AcademyRequestDto' } } } } } },
        '400': { description: 'Datos inválidos / academia archivada' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'Academia inexistente (join)' },
        '409': { description: 'Duplicado pendiente / ya miembro / slug existe' },
        '429': { description: 'Rate limit excedido (10/min por IP)' },
      },
    },
    get: {
      tags: ['Solicitudes de Acceso'],
      summary: 'Listar solicitudes',
      description: 'guardSuperAdmin. Filtros opcionales status/type. Incluye requester (email/firstName/lastName) y academy (name/slug). Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['pending', 'approved', 'rejected'] } },
        { name: 'type', in: 'query', required: false, schema: { type: 'string', enum: ['join_academy', 'create_academy'] } },
      ],
      responses: {
        '200': { description: 'Lista de solicitudes', content: { 'application/json': { schema: { type: 'object', properties: { requests: { type: 'array', items: { $ref: '#/components/schemas/AcademyRequestDto' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
      },
    },
  },
  '/api/academy-requests/{id}/approve': {
    post: {
      tags: ['Solicitudes de Acceso'],
      summary: 'Aprobar solicitud',
      description: 'guardSuperAdmin. join → membresía active con requestedRole; create → academia + OWNER=requester. 400 ya revisada. 404 inexistente. 409 ya miembro activo (join) / slug colisiona (create). Audita REQUEST_APPROVED + MEMBER_ROLE_ASSIGNED (join) o ACADEMY_CREATED (create).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Solicitud aprobada', content: { 'application/json': { schema: { type: 'object', properties: { request: { $ref: '#/components/schemas/AcademyRequestDto' }, membership: { type: 'object' }, academy: { type: 'object' } } } } } },
        '400': { description: 'Ya revisada' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
        '404': { description: 'Solicitud inexistente' },
        '409': { description: 'Ya miembro activo / slug colisiona' },
      },
    },
  },
  '/api/academy-requests/{id}/reject': {
    post: {
      tags: ['Solicitudes de Acceso'],
      summary: 'Rechazar solicitud',
      description: 'guardSuperAdmin. 400 ya revisada. 404 inexistente. Audita REQUEST_REJECTED.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Solicitud rechazada', content: { 'application/json': { schema: { type: 'object', properties: { request: { $ref: '#/components/schemas/AcademyRequestDto' } } } } } },
        '400': { description: 'Ya revisada' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol SUPER_ADMIN' },
        '404': { description: 'Solicitud inexistente' },
      },
    },
  },
  '/api/academy-requests/available-academies': {
    get: {
      tags: ['Solicitudes de Acceso'],
      summary: 'Listar academias activas disponibles',
      description: 'guardAdmin. Academias activas {id, name, slug} para el selector del modal de join. Sin auditoría (lectura).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de academias activas', content: { 'application/json': { schema: { type: 'object', properties: { academies: { type: 'array', items: { $ref: '#/components/schemas/AvailableAcademyDto' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
  },
} as const