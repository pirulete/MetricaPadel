/**
 * Paths OpenAPI de Cursos, Dashboard y Historial (Etapa 2+3).
 * Referencias a schemas en lib/api-docs/schemas/courses.ts.
 */
export const padelCoursesTags = {
  name: 'Padel Courses',
  description: 'Cursos del coach (guardAdmin + ownership ownerId), join del alumno (guardUser)',
};

export const padelDashboardTags = {
  name: 'Padel Dashboard',
  description: 'Métricas de home: coach (P01, guardAdmin) y alumno (A01, guardUser)',
};

export const coursesPaths = {
  '/api/courses': {
    get: {
      tags: ['Padel Courses'],
      summary: 'Listar cursos del coach',
      description: 'Lista cursos del coach (ownerId = sesión) con studentCount. Scoped al owner (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Lista de cursos', content: { 'application/json': { schema: { type: 'object', properties: { courses: { type: 'array', items: { $ref: '#/components/schemas/CourseListItem' } } } } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    post: {
      tags: ['Padel Courses'],
      summary: 'Crear curso',
      description: 'Crea curso activo con inviteCode PAD-XXXX generado (retry ≤5 en colisión UNIQUE, D4). Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseInput' } } } },
      responses: {
        '201': { description: 'Curso creado', content: { 'application/json': { schema: { type: 'object', properties: { course: { $ref: '#/components/schemas/CourseDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '500': { description: 'Colisión de inviteCode tras 5 retries' },
      },
    },
  },
  '/api/courses/{id}': {
    get: {
      tags: ['Padel Courses'],
      summary: 'Detalle de curso',
      description: 'Detalle de curso (course + students[] + rubrics[]). 404 si no pertenece al coach (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { type: 'object', properties: { course: { $ref: '#/components/schemas/CourseDetail' } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrado' },
      },
    },
    put: {
      tags: ['Padel Courses'],
      summary: 'Actualizar curso',
      description: 'Actualiza campos parciales (name/level/schedule/days). Audita UPDATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/CourseInput' } } } },
      responses: {
        '200': { description: 'Curso actualizado', content: { 'application/json': { schema: { type: 'object', properties: { course: { $ref: '#/components/schemas/CourseDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrado' },
      },
    },
    delete: {
      tags: ['Padel Courses'],
      summary: 'Archivar curso',
      description: 'Archiva curso (soft, status=archived, D7). Nunca hard delete: enrollments y course_rubrics se conservan. Audita DELETE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Curso archivado', content: { 'application/json': { schema: { type: 'object', properties: { course: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, status: { type: 'string', enum: ['archived'] } } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'No encontrado' },
      },
    },
  },
  '/api/courses/join': {
    post: {
      tags: ['Padel Courses'],
      summary: 'Unirse a curso por código',
      description: 'Inscribe al alumno (USER) por inviteCode (case-insensitive). 400 coach en su propio curso; 404 código inválido/archivado; 409 ya inscrito. Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/JoinInput' } } } },
      responses: {
        '201': { description: 'Inscrito', content: { 'application/json': { schema: { type: 'object', properties: { enrollment: { $ref: '#/components/schemas/EnrollmentDto' } } } } } },
        '400': { description: 'Coach uniéndose a su propio curso' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED)' },
        '404': { description: 'Código inválido o curso archivado' },
        '409': { description: 'Ya inscrito' },
      },
    },
  },
  '/api/courses/{id}/rubrics': {
    get: {
      tags: ['Padel Courses'],
      summary: 'Rúbricas asignadas al curso',
      description: 'Lista rúbricas asignadas al curso (P07 tab). 404 si el curso no pertenece al coach.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Lista', content: { 'application/json': { schema: { type: 'object', properties: { rubrics: { type: 'array', items: { $ref: '#/components/schemas/CourseRubricDto' } } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'Curso no encontrado' },
      },
    },
    post: {
      tags: ['Padel Courses'],
      summary: 'Asignar rúbrica al curso',
      description: 'Asigna rúbrica activa del coach al curso (P08). 400 rúbrica ajena/no activa; 409 ya asignada (D2). Audita CREATE.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RubricAssignInput' } } } },
      responses: {
        '201': { description: 'Asignada', content: { 'application/json': { schema: { type: 'object', properties: { assignment: { $ref: '#/components/schemas/CourseRubricDto' } } } } } },
        '400': { description: 'Rúbrica no encontrada o no activa' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
        '404': { description: 'Curso no encontrado' },
        '409': { description: 'Rúbrica ya asignada' },
      },
    },
  },
  '/api/courses/{id}/enrollment': {
    delete: {
      tags: ['Padel Courses'],
      summary: 'Salirse de un curso (alumno)',
      description: 'Elimina la inscripción del alumno autenticado (USER, ACTIVE) al curso (G11). 404 si no está inscrito (anti-IDOR). Audita DELETE. El UNIQUE liberado permite re-join.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Desinscrito', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean', enum: [true] } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED o rol ADMIN)' },
        '404': { description: 'No inscrito' },
      },
    },
  },
  '/api/dashboard/teacher': {
    get: {
      tags: ['Padel Dashboard'],
      summary: 'Métricas del coach (P01)',
      description: 'Métricas: students (enrollments de sus cursos), evaluations (propias), average (publicadas, null si no hay), classesToday + cursos.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Dashboard', content: { 'application/json': { schema: { $ref: '#/components/schemas/TeacherDashboardDto' } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
  },
  '/api/dashboard/student': {
    get: {
      tags: ['Padel Dashboard'],
      summary: 'Dashboard del alumno (A01)',
      description: 'Nivel derivado de la última evaluación publicada, cursos activos y últimas 5 notificaciones del inbox.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Dashboard', content: { 'application/json': { schema: { $ref: '#/components/schemas/StudentDashboardDto' } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED)' },
      },
    },
  },
  '/api/history': {
    get: {
      tags: ['Padel Courses'],
      summary: 'Historial de evaluaciones del coach (P10)',
      description: 'Historial con filtros opcionales ?courseId=&studentId=&status=draft|published. Anti-IDOR: teacherId = sesión (D8).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'courseId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
        { name: 'studentId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } },
        { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['draft', 'published'] } },
      ],
      responses: {
        '200': { description: 'Historial', content: { 'application/json': { schema: { type: 'object', properties: { evaluations: { type: 'array', items: { $ref: '#/components/schemas/HistoryItemDto' } } } } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
  },
} as const;