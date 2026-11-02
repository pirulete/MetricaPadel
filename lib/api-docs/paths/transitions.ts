/**
 * Paths OpenAPI del Editor de Transiciones del coach (coach/ADMIN).
 * Referencias a schemas en lib/api-docs/schemas/transitions.ts.
 * Todos los endpoints: guardAdmin (ADMIN|SUPER_ADMIN + ACTIVE), ownership
 * anti-IDOR por ownerId → 404 para recursos ajenos o inexistentes.
 */
export const padelTransitionsTags = {
  name: 'Padel Transitions',
  description: 'Editor de transiciones del coach: biblioteca y CRUD de escenarios tácticos (guardAdmin + ownership, auditoría en mutaciones)',
};

const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;

export const transitionsPaths = {
  '/api/transitions': {
    get: {
      tags: ['Padel Transitions'],
      summary: 'Listar transiciones del coach',
      description: 'Biblioteca del coach (ownerId = sesión) con `stepCount` calculado en SQL. Paginación por cursor (G15): ?limit=1..50 (default 20) y ?cursor= (ISO date string del último item). Scoped al owner (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 } },
        { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'date-time', description: 'ISO date string del último item de la página anterior' } },
      ],
      responses: {
        '200': { description: 'Lista de transiciones', content: { 'application/json': { schema: { $ref: '#/components/schemas/TransitionListResponse' } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (rol distinto de ADMIN o status no ACTIVE)' },
      },
    },
    post: {
      tags: ['Padel Transitions'],
      summary: 'Crear transición',
      description: 'Crea una transición con `scenario = { initialStepIndex, steps }`. Audita CREATE.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TransitionInput' } } } },
      responses: {
        '201': { description: 'Transición creada', content: { 'application/json': { schema: { type: 'object', properties: { transition: { $ref: '#/components/schemas/TransitionDto' } } } } } },
        '400': { description: 'Datos inválidos (p. ej. initialStepIndex fuera de rango o punto fuera de cancha)' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (rol distinto de ADMIN o status no ACTIVE)' },
      },
    },
  },

  '/api/transitions/{id}': {
    get: {
      tags: ['Padel Transitions'],
      summary: 'Detalle de transición',
      description: 'Detalle completo de una transición del coach. 404 si no existe, es ajena (anti-IDOR) o el `scenario` guardado no valida.',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      responses: {
        '200': { description: 'Detalle', content: { 'application/json': { schema: { type: 'object', properties: { transition: { $ref: '#/components/schemas/TransitionDto' } } } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (rol distinto de ADMIN o status no ACTIVE)' },
        '404': { description: 'No encontrada o ajena' },
      },
    },
    put: {
      tags: ['Padel Transitions'],
      summary: 'Reemplazar transición',
      description: 'Reemplazo completo del documento (title + initialStepIndex + steps, D-06). La autorización vive en el `where(id, ownerId).returning()` → 404. Audita UPDATE (old/new title + stepCount).',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/TransitionInput' } } } },
      responses: {
        '200': { description: 'Transición actualizada', content: { 'application/json': { schema: { type: 'object', properties: { transition: { $ref: '#/components/schemas/TransitionDto' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (rol distinto de ADMIN o status no ACTIVE)' },
        '404': { description: 'No encontrada o ajena' },
      },
    },
    delete: {
      tags: ['Padel Transitions'],
      summary: 'Eliminar transición',
      description: 'Hard delete por owner (sin FKs entrantes; `audit_logs` conserva el rastro). `.returning()` vacío → 404. Audita DELETE.',
      security: [{ bearerAuth: [] }],
      parameters: [idParam],
      responses: {
        '200': { description: 'Transición eliminada', content: { 'application/json': { schema: { $ref: '#/components/schemas/TransitionDeleteResponse' } } } },
        '400': { description: 'id inválido' },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (rol distinto de ADMIN o status no ACTIVE)' },
        '404': { description: 'No encontrada o ajena' },
      },
    },
  },
} as const;
