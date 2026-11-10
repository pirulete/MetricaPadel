/**
 * Paths OpenAPI de la Agenda de clases por curso (coach).
 * Referencias a schemas en lib/api-docs/schemas/class-agenda.ts.
 * Todos: guardAdmin (ADMIN|SUPER_ADMIN + ACTIVE), ownership `courses.ownerId` →
 * 404 anti-IDOR. A2–A5 y A7–A12 sobre curso archivado → 409 AGENDA_COURSE_ARCHIVED;
 * A1 y A6 son lectura y sí permiten curso archivado.
 */
export const padelAgendaTags = {
  name: 'Padel Agenda',
  description: 'Agenda de clases por curso del coach: plantilla semanal, bloques y asistencia (guardAdmin + ownership, auditoría en mutaciones)',
};

const courseIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Curso (debe pertenecer al coach)' } as const;
const slotIdParam = { name: 'slotId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;
const blockIdParam = { name: 'blockId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Bloque del curso (de otro curso ⇒ 404)' } as const;
const studentIdParam = { name: 'studentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } } as const;

const unauthorized = { description: 'No autenticado' } as const;
const forbidden = { description: 'No autorizado (rol distinto de ADMIN/SUPER_ADMIN o status no ACTIVE)' } as const;
const invalidInput = {
  description: 'Datos inválidos (Zod): `{ error, details }`',
  content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' }, details: { type: 'array', items: { type: 'object' } } } } } },
} as const;
const courseNotFound = { description: 'Curso no encontrado o ajeno (anti-IDOR)' } as const;
const courseArchived = {
  description: 'El curso está archivado (EC-13): `AGENDA_COURSE_ARCHIVED`',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/AgendaError' } } },
} as const;
const dtoRef = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const wrapper = (property: string, ref: string) => ({
  type: 'object',
  properties: { [property]: dtoRef(ref) },
});

export const classAgendaPaths = {
  '/api/courses/{id}/agenda/slots': {
    get: {
      tags: ['Padel Agenda'],
      summary: 'Listar plantilla semanal (A1)',
      description: 'Slots semanales del curso (plantilla que se materializa en bloques). Permitido en curso archivado.',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam],
      responses: {
        '200': { description: 'Slots del curso (sin timestamps)', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: dtoRef('WeeklySlotDto') } } } } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
      },
    },
    post: {
      tags: ['Padel Agenda'],
      summary: 'Crear slot semanal (A2)',
      description: 'Crea un slot ISO 1–7 + HH:mm. `dayOfWeek` + `startTime` es UNIQUE por curso. Audita CREATE (`weekly_slot`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('WeeklySlotInput') } } },
      responses: {
        '201': { description: 'Slot creado', content: { 'application/json': { schema: wrapper('slot', 'WeeklySlotDto') } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
        '409': {
          description: 'Curso archivado (`AGENDA_COURSE_ARCHIVED`) o slot duplicado (`AGENDA_SLOT_DUPLICATE`)',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
  },

  '/api/courses/{id}/agenda/slots/{slotId}': {
    put: {
      tags: ['Padel Agenda'],
      summary: 'Actualizar slot semanal (A3)',
      description: 'Actualización parcial (≥1 campo; body vacío ⇒ 400). Audita UPDATE (`weekly_slot`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, slotIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('WeeklySlotUpdateInput') } } },
      responses: {
        '200': { description: 'Slot actualizado', content: { 'application/json': { schema: wrapper('slot', 'WeeklySlotDto') } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o slot inexistente' },
        '409': {
          description: 'Curso archivado (`AGENDA_COURSE_ARCHIVED`) o slot duplicado (`AGENDA_SLOT_DUPLICATE`)',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
    delete: {
      tags: ['Padel Agenda'],
      summary: 'Eliminar slot semanal (A4)',
      description: 'Borra el slot; los bloques ya materializados se conservan y quedan desvinculados (`detachedBlocks`). Audita DELETE (`weekly_slot`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, slotIdParam],
      responses: {
        '200': {
          description: 'Slot eliminado',
          content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'boolean' }, detachedBlocks: { type: 'integer', description: 'Bloques que perdieron weeklySlotId' } } } } },
        },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o slot inexistente' },
        '409': courseArchived,
      },
    },
  },

  '/api/courses/{id}/agenda/weeks': {
    post: {
      tags: ['Padel Agenda'],
      summary: 'Materializar semana (A5)',
      description: 'Genera los bloques de la semana a partir de los slots activos (default: lunes de la semana actual, `APP_TIMEZONE`). Idempotente (D7): `skipped` cuenta los ya existentes. Audita CREATE (`class_block_week`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Debe ser lunes; default = lunes actual' } },
            },
          },
        },
      },
      responses: {
        '200': { description: 'Semana materializada', content: { 'application/json': { schema: dtoRef('MaterializeWeekResult') } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
        '409': {
          description: 'Curso archivado (`AGENDA_COURSE_ARCHIVED`) o sin slots activos (`AGENDA_NO_SLOTS`)',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
  },

  '/api/courses/{id}/agenda/blocks': {
    get: {
      tags: ['Padel Agenda'],
      summary: 'Bloques por rango (A6)',
      description: 'Bloques del curso entre `from` y `to` (default: semana actual). Rango máximo 8 semanas. Permitido en curso archivado.',
      security: [{ bearerAuth: [] }],
      parameters: [
        courseIdParam,
        { name: 'from', in: 'query', required: false, schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: 'YYYY-MM-DD' },
        { name: 'to', in: 'query', required: false, schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, description: 'YYYY-MM-DD' },
      ],
      responses: {
        '200': { description: 'Bloques del rango', content: { 'application/json': { schema: { type: 'object', properties: { blocks: { type: 'array', items: dtoRef('CourseBlockDto') } } } } } },
        '400': { description: 'Query inválida (fecha inválida, `from` > `to` o rango > 56 días)' },
        '401': unauthorized,
        '403': forbidden,
        '404': courseNotFound,
      },
    },
    post: {
      tags: ['Padel Agenda'],
      summary: 'Crear bloque (A7)',
      description: 'Crea un bloque suelto o instancia de un slot. UNIQUE (weeklySlotId, blockDate) ⇒ 409. Audita CREATE (`class_block`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('BlockCreateInput') } } },
      responses: {
        '201': { description: 'Bloque creado', content: { 'application/json': { schema: wrapper('block', 'CourseBlockDto') } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o `weeklySlotId` ajeno' },
        '409': {
          description: 'Curso archivado (`AGENDA_COURSE_ARCHIVED`) o bloque duplicado (`AGENDA_BLOCK_DUPLICATE`)',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
  },

  '/api/courses/{id}/agenda/blocks/{blockId}': {
    get: {
      tags: ['Padel Agenda'],
      summary: 'Detalle del bloque con inscripciones (A8)',
      description: 'Bloque con contadores reales (enrolledCount/attendedCount/capacityRemaining/isPast/canEditTiming) + inscripciones con datos del alumno. Lo consume el sheet de asignación al reabrir un bloque. Lectura sin auditoría; permitido en curso archivado.',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam],
      responses: {
        '200': {
          description: 'Bloque + inscripciones',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  block: dtoRef('CourseBlockDto'),
                  enrollments: { type: 'array', items: dtoRef('BlockEnrollmentDto') },
                },
              },
            },
          },
        },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o bloque de otro curso' },
      },
    },
    put: {
      tags: ['Padel Agenda'],
      summary: 'Editar bloque o cambiar estado (A8)',
      description: 'Actualización parcial (≥1 campo). `status:"cancelled"` cancela el bloque y sus inscripciones en una tx y notifica post-commit; `status:"completed"` lo cierra. No se puede editar un bloque cancelado ni el horario de uno pasado. Audita UPDATE (`class_block`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('BlockUpdateInput') } } },
      responses: {
        '200': {
          description: 'Bloque actualizado',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { block: dtoRef('CourseBlockDto'), notified: { type: 'integer', description: 'Notificaciones creadas al cancelar' } } },
            },
          },
        },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o bloque inexistente' },
        '409': {
          description: '`AGENDA_COURSE_ARCHIVED` · `AGENDA_BLOCK_CANCELLED` · `AGENDA_BLOCK_PAST`',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
    delete: {
      tags: ['Padel Agenda'],
      summary: 'Eliminar bloque (A9)',
      description: 'Solo bloques sin inscripciones; con inscripciones ⇒ 409 (usar cancelación). Audita DELETE (`class_block`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam],
      responses: {
        '200': { description: 'Bloque eliminado', content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'boolean' } } } } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso no encontrado/ajeno o bloque inexistente' },
        '409': {
          description: '`AGENDA_COURSE_ARCHIVED` o `AGENDA_BLOCK_HAS_ENROLLMENTS`',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
  },

  '/api/courses/{id}/agenda/blocks/{blockId}/enrollments': {
    post: {
      tags: ['Padel Agenda'],
      summary: 'Asignar alumnos al bloque (A10)',
      description: 'All-or-nothing (D10): si algún alumno no está inscrito al curso o no hay cupo, no se escribe nada. Idempotente por alumno (`alreadyAssigned`). Notifica `class.assigned` post-commit solo a los nuevos. Audita CREATE (`block_enrollment`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('BlockEnrollmentAssignInput') } } },
      responses: {
        '201': { description: 'Asignación aplicada', content: { 'application/json': { schema: dtoRef('BlockEnrollmentAssignResult') } } },
        '400': {
          description: 'Zod inválido o `AGENDA_STUDENT_NOT_ENROLLED` (incluye `studentIds` fuera del curso)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { error: { type: 'string' }, code: { type: 'string', enum: ['AGENDA_STUDENT_NOT_ENROLLED'] }, studentIds: { type: 'array', items: { type: 'string', format: 'uuid' } }, details: { type: 'array', items: { type: 'object' } } },
              },
            },
          },
        },
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso o bloque no encontrado / ajeno' },
        '409': {
          description: '`AGENDA_COURSE_ARCHIVED` · `AGENDA_CAPACITY` (incluye `remaining`) · `AGENDA_BLOCK_CANCELLED`',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
  },

  '/api/courses/{id}/agenda/blocks/{blockId}/enrollments/{studentId}': {
    put: {
      tags: ['Padel Agenda'],
      summary: 'Marcar asistencia (A11)',
      description: 'Asistencia tri-estado (`attended: null|true|false`) + `notes`. true/false mueve la inscripción a `completed`. Audita UPDATE (`block_enrollment`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam, studentIdParam],
      requestBody: { required: true, content: { 'application/json': { schema: dtoRef('AttendanceInput') } } },
      responses: {
        '200': { description: 'Asistencia actualizada', content: { 'application/json': { schema: dtoRef('AttendanceResult') } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso, bloque o inscripción no encontrados / ajenos' },
        '409': {
          description: '`AGENDA_COURSE_ARCHIVED` o `AGENDA_BLOCK_CANCELLED`',
          content: { 'application/json': { schema: dtoRef('AgendaError') } },
        },
      },
    },
    delete: {
      tags: ['Padel Agenda'],
      summary: 'Quitar alumno del bloque (A12)',
      description: 'Elimina la inscripción al bloque (no toca la inscripción al curso). Audita DELETE (`block_enrollment`).',
      security: [{ bearerAuth: [] }],
      parameters: [courseIdParam, blockIdParam, studentIdParam],
      responses: {
        '200': { description: 'Inscripción eliminada', content: { 'application/json': { schema: { type: 'object', properties: { removed: { type: 'boolean' } } } } } },
        '400': invalidInput,
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Curso, bloque o inscripción no encontrados / ajenos' },
        '409': courseArchived,
      },
    },
  },
} as const;
