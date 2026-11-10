/**
 * Paths OpenAPI de la Agenda del alumno (solo lectura).
 * guardUser + ACTIVE + role USER (TEMPORARY/LOCKED ⇒ 403). Anti-IDOR por
 * `course_enrollments`: curso donde no está inscrito ⇒ 404.
 * Cursor U2 = `YYYY-MM-DDTHH:mm` (wall-clock), documentado como `type: string`
 * + `pattern` (sin `format: date-time`, B2).
 */
export const padelStudentAgendaTags = {
  name: 'Padel Student Agenda',
  description: 'Agenda del alumno: próximas clases, agregados de asistencia e historial paginado (guardUser + ACTIVE, read-only)',
};

const cursorParam = {
  name: 'cursor',
  in: 'query',
  required: false,
  schema: {
    type: 'string',
    pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$',
    example: '2026-11-04T18:00',
    description: 'Par wall-clock `YYYY-MM-DDTHH:mm` (NO es un instante ISO: `...:00.000Z` ⇒ 400)',
  },
} as const;

const courseIdQuery = {
  name: 'courseId',
  in: 'query',
  required: false,
  schema: { type: 'string', format: 'uuid' },
  description: 'Filtra a un curso; si el alumno no está inscrito ⇒ 404',
} as const;

const unauthorized = { description: 'No autenticado' } as const;
const forbidden = { description: 'No autorizado (status no ACTIVE o rol distinto de USER)' } as const;
const invalidQuery = {
  description: 'Query inválida (Zod): `{ error, details }`',
  content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } } } },
} as const;
const courseNotFound = { description: 'Curso no encontrado o no inscrito (anti-IDOR)' } as const;

export const studentAgendaPaths = {
  '/api/student/agenda': {
    get: {
      tags: ['Padel Student Agenda'],
      summary: 'Próximas clases + agregados (U1)',
      description: 'Bloques `scheduled` con `blockDate >= hoy` (APP_TIMEZONE) en cursos donde el alumno sigue inscrito, orden ascendente. `limit` default 5 (sin `resolveLimit`, A5). Los agregados son la única fuente de contadores de asistencia.',
      security: [{ bearerAuth: [] }],
      parameters: [
        courseIdQuery,
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 5 }, description: 'Cantidad de próximas clases' },
      ],
      responses: {
        '200': {
          description: 'Próximas clases y agregados',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  upcoming: { type: 'array', items: { $ref: '#/components/schemas/StudentClassDto' } },
                  aggregates: { $ref: '#/components/schemas/AttendanceAggregates' },
                  todayIso: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: '"Hoy" según APP_TIMEZONE' },
                },
              },
            },
          },
        },
        '400': invalidQuery,
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
      },
    },
  },

  '/api/student/agenda/history': {
    get: {
      tags: ['Padel Student Agenda'],
      summary: 'Historial de clases (U2)',
      description: 'Clases pasadas (`blockDate < hoy`) o no `scheduled`, orden `blockDate DESC, startTime DESC`. Cursor propio por `(blockDate, startTime)` con `limit+1` para `hasMore`; `nextCursor` usa el mismo formato `YYYY-MM-DDTHH:mm` y es `null` en la última página. Sin `aggregates` (una sola fuente: U1).',
      security: [{ bearerAuth: [] }],
      parameters: [
        courseIdQuery,
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 }, description: 'Default 20 (resolveLimit)' },
        cursorParam,
      ],
      responses: {
        '200': {
          description: 'Página de historial',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  items: { type: 'array', items: { $ref: '#/components/schemas/StudentClassDto' } },
                  nextCursor: { type: 'string', nullable: true, pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$', description: 'null si no hay más páginas' },
                },
              },
            },
          },
        },
        '400': { description: 'Query inválida (cursor debe ser `YYYY-MM-DDTHH:mm`; `YYYY-MM-DD` o ISO con segundos ⇒ 400)' },
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
      },
    },
  },
} as const;
