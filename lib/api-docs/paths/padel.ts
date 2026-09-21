/**
 * Paths OpenAPI del Core Evaluativo (rúbricas + evaluaciones + admin users).
 * Referencias a schemas en lib/api-docs/schemas/padel.ts.
 */
export const padelAdminTags = {
  name: 'Padel Admin',
  description: 'Rúbricas y evaluaciones del coach (guardAdmin + ownership por ownerId/teacherId)',
};

export const padelStudentTags = {
  name: 'Padel Student',
  description: 'Evaluaciones publicadas del alumno (guardUser + ownership por studentId)',
};

export const padelPaths = {
  '/api/admin/users': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Listar jugadores (role USER)',
      description: 'Lista jugadores para el picker de evaluación. Query: ?search= (ILIKE por nombre/email).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'search', in: 'query', required: false, schema: { type: 'string', maxLength: 100 } }],
      responses: {
        '200': { description: 'Lista de jugadores', content: { 'application/json': { schema: { type: 'object', properties: { users: { type: 'array', items: { $ref: '#/components/schemas/AdminUserDto' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    post: {
      tags: ['Padel Admin'],
      summary: 'Crear usuario jugador',
      description: 'Crea USER con status=ACTIVE directo (sin verificación de email). Email duplicado → 409. Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminUserInput' } } } },
      responses: {
        '201': { description: 'Usuario creado', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '409': { description: 'Email duplicado' },
      },
    },
  },
  '/api/admin/users/{id}': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Detalle de jugador',
      description: 'Detalle de un jugador (solo role USER). 404 si no existe o no es USER.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Jugador', content: { 'application/json': { schema: { type: 'object', properties: { user: { $ref: '#/components/schemas/AdminUserDto' } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrado' },
      },
    },
  },
  '/api/rubrics': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Listar rúbricas del coach',
      description: 'Lista rúbricas del coach (ownerId = sesión) con counts de criteria/levels. Query: ?status=draft|active|archived.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'active', 'archived'] } }],
      responses: {
        '200': { description: 'Lista de rúbricas', content: { 'application/json': { schema: { type: 'object', properties: { rubrics: { type: 'array', items: { $ref: '#/components/schemas/RubricListItem' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    post: {
      tags: ['Padel Admin'],
      summary: 'Crear rúbrica',
      description: 'Crea rúbrica con 4 niveles fijos + criteria + descriptors (transacción). Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RubricInput' } } } },
      responses: {
        '201': { description: 'Rúbrica creada', content: { 'application/json': { schema: { type: 'object', properties: { rubric: { $ref: '#/components/schemas/RubricDetail' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
  },
  '/api/rubrics/{id}': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Detalle de rúbrica',
      description: 'Detalle completo (rubric + levels + criteria + descriptors). 404 si no pertenece al coach (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { $ref: '#/components/schemas/RubricDetail' } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada' },
      },
    },
    put: {
      tags: ['Padel Admin'],
      summary: 'Actualizar rúbrica',
      description: 'Actualiza title/category y, si viene criteria, reemplaza el set completo (delete + reinsert). Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RubricInput' } } } },
      responses: {
        '200': { description: 'Rúbrica actualizada', content: { 'application/json': { schema: { type: 'object', properties: { rubric: { $ref: '#/components/schemas/RubricDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada' },
      },
    },
    delete: {
      tags: ['Padel Admin'],
      summary: 'Archivar rúbrica',
      description: 'Archiva rúbrica (soft, status=archived). Nunca hard delete. Audita DELETE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Rúbrica archivada', content: { 'application/json': { schema: { type: 'object', properties: { rubric: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['archived'] } } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/evaluations': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Listar evaluaciones del coach',
      description: 'Lista evaluaciones del coach (teacherId = sesión) con studentName + rubricTitle. Query: ?status=draft|published.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'published'] } }],
      responses: {
        '200': { description: 'Lista de evaluaciones', content: { 'application/json': { schema: { type: 'object', properties: { evaluations: { type: 'array', items: { $ref: '#/components/schemas/EvaluationListItem' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    post: {
      tags: ['Padel Admin'],
      summary: 'Crear borrador de evaluación',
      description: 'Crea borrador (status=draft). Valida rúbrica del coach (404) y alumno role USER (404). Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EvaluationCreateInput' } } } },
      responses: {
        '201': { description: 'Borrador creado', content: { 'application/json': { schema: { type: 'object', properties: { evaluation: { $ref: '#/components/schemas/EvaluationDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'Rúbrica o alumno no encontrado' },
      },
    },
  },
  '/api/evaluations/{id}': {
    get: {
      tags: ['Padel Admin'],
      summary: 'Detalle de evaluación',
      description: 'Detalle de evaluación + scores + student + rubric. 404 si no pertenece al teacher (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { $ref: '#/components/schemas/EvaluationDetail' } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada' },
      },
    },
    put: {
      tags: ['Padel Admin'],
      summary: 'Guardar scores de evaluación',
      description: 'Guarda scores + globalComment en borrador (solo status=draft). Recalcula totalScore. Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/EvaluationSaveInput' } } } },
      responses: {
        '200': { description: 'Evaluación actualizada', content: { 'application/json': { schema: { type: 'object', properties: { evaluation: { $ref: '#/components/schemas/EvaluationDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada o ya publicada' },
      },
    },
  },
  '/api/evaluations/{id}/publish': {
    post: {
      tags: ['Padel Admin'],
      summary: 'Publicar evaluación',
      description: 'Publica evaluación validando que todos los criteria tengan score. 400 si no es borrador o faltan criterios. Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Evaluación publicada', content: { 'application/json': { schema: { type: 'object', properties: { evaluation: { $ref: '#/components/schemas/EvaluationDto' } } } } } },
        '400': { description: 'No es borrador o faltan criterios' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/student/evaluations': {
    get: {
      tags: ['Padel Student'],
      summary: 'Listar evaluaciones publicadas del alumno',
      description: 'Lista evaluaciones publicadas del alumno (studentId = sesión). Solo published.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista', content: { 'application/json': { schema: { type: 'object', properties: { evaluations: { type: 'array', items: { $ref: '#/components/schemas/StudentEvaluationListItem' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED)' },
      },
    },
  },
  '/api/student/evaluations/{id}': {
    get: {
      tags: ['Padel Student'],
      summary: 'Detalle de evaluación publicada propia',
      description: 'Detalle con scores enriquecidos (criterionName/levelName/descriptor). 404 si no pertenece al alumno o no está publicada.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentEvaluationDetail' } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED)' },
        '404': { description: 'No encontrada' },
      },
    },
  },
  '/api/student/evaluations/{id}/read': {
    post: {
      tags: ['Padel Student'],
      summary: 'Marcar evaluación como leída',
      description: 'Marca evaluación publicada como leída (idempotente). 404 si no pertenece al alumno o no está publicada.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Marcada como leída', content: { 'application/json': { schema: { type: 'object', properties: { evaluation: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, readAt: { type: 'string', format: 'date-time', nullable: true } } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED)' },
        '404': { description: 'No encontrada' },
      },
    },
  },
} as const;