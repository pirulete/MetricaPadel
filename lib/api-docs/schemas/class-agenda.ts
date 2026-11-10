/**
 * Schemas OpenAPI de la Agenda de clases por curso (v0.11).
 * Referenciados desde lib/api-docs/paths/class-agenda.ts y student-agenda.ts.
 * Fecha = `YYYY-MM-DD` wall-clock sin TZ; hora = `HH:mm` (D3).
 */
export const classAgendaSchemas = {
  WeeklySlotInput: {
    type: 'object',
    required: ['dayOfWeek', 'startTime', 'durationMinutes'],
    properties: {
      dayOfWeek: { type: 'integer', minimum: 1, maximum: 7, description: 'ISO 1–7 (lun=1 … dom=7)' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '18:00', description: 'Hora wall-clock HH:mm (24h)' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 180 },
      label: { type: 'string', maxLength: 100, nullable: true },
      isActive: { type: 'boolean', description: 'Solo los slots activos se materializan (default true)' },
    },
  },
  WeeklySlotUpdateInput: {
    type: 'object',
    minProperties: 1,
    description: 'Todos los campos opcionales; al menos uno requerido (400 si el body queda vacío)',
    properties: {
      dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 180 },
      label: { type: 'string', maxLength: 100, nullable: true },
      isActive: { type: 'boolean' },
    },
  },
  WeeklySlotDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      courseId: { type: 'string', format: 'uuid' },
      dayOfWeek: { type: 'integer', minimum: 1, maximum: 7 },
      startTime: { type: 'string', description: 'HH:mm' },
      durationMinutes: { type: 'integer' },
      label: { type: 'string', nullable: true },
      isActive: { type: 'boolean' },
    },
  },
  CourseBlockDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      courseId: { type: 'string', format: 'uuid' },
      weeklySlotId: { type: 'string', format: 'uuid', nullable: true },
      blockDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'YYYY-MM-DD wall-clock' },
      startTime: { type: 'string', description: 'HH:mm' },
      durationMinutes: { type: 'integer' },
      status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
      maxCapacity: { type: 'integer', nullable: true, description: 'null = sin cupo definido' },
      label: { type: 'string', nullable: true },
      enrolledCount: { type: 'integer', description: 'Inscripciones no canceladas' },
      attendedCount: { type: 'integer' },
      capacityRemaining: { type: 'integer', nullable: true },
      isPast: { type: 'boolean', description: 'blockDate < hoy (APP_TIMEZONE)' },
      canEditTiming: { type: 'boolean', description: 'false si el bloque ya pasó (AGENDA_BLOCK_PAST)' },
    },
  },
  BlockCreateInput: {
    type: 'object',
    required: ['blockDate', 'startTime', 'durationMinutes'],
    properties: {
      blockDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-11-09' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '18:00' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 180 },
      label: { type: 'string', maxLength: 100, nullable: true },
      maxCapacity: { type: 'integer', minimum: 1, nullable: true },
      weeklySlotId: { type: 'string', format: 'uuid', nullable: true, description: 'Debe pertenecer al curso (404 si no)' },
    },
  },
  BlockUpdateInput: {
    type: 'object',
    minProperties: 1,
    description: 'Al menos un campo. `status` cambia el estado del bloque (cancelar = cancelled).',
    properties: {
      blockDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      startTime: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' },
      durationMinutes: { type: 'integer', minimum: 15, maximum: 180 },
      label: { type: 'string', maxLength: 100, nullable: true },
      maxCapacity: { type: 'integer', minimum: 1, nullable: true },
      weeklySlotId: { type: 'string', format: 'uuid', nullable: true },
      status: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
    },
  },
  MaterializeWeekResult: {
    type: 'object',
    properties: {
      weekStart: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      weekEnd: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      created: { type: 'integer', description: 'Bloques creados en esta llamada' },
      skipped: { type: 'integer', description: 'Bloques ya existentes (idempotente, D7)' },
      blocks: { type: 'array', items: { $ref: '#/components/schemas/CourseBlockDto' } },
    },
  },
  BlockEnrollmentDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      blockId: { type: 'string', format: 'uuid' },
      studentId: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      status: { type: 'string', enum: ['assigned', 'cancelled', 'completed'] },
      attended: { type: 'boolean', nullable: true, description: 'Tri-estado: null sin marcar, true asistió, false faltó' },
      notes: { type: 'string', nullable: true },
    },
  },
  BlockEnrollmentAssignInput: {
    type: 'object',
    required: ['studentIds'],
    properties: {
      studentIds: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: { type: 'string', format: 'uuid' },
        description: 'Alumnos inscritos al curso (all-or-nothing, D10)',
      },
    },
  },
  BlockEnrollmentAssignResult: {
    type: 'object',
    properties: {
      assigned: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Nuevos en esta llamada' },
      alreadyAssigned: { type: 'array', items: { type: 'string', format: 'uuid' } },
      enrolledCount: { type: 'integer' },
      notified: { type: 'integer', description: 'Notificaciones inbox creadas post-commit (best-effort)' },
    },
  },
  AttendanceInput: {
    type: 'object',
    required: ['attended'],
    properties: {
      attended: { type: 'boolean', nullable: true, description: 'null = sin marcar; true/false mueve la inscripción a completed' },
      notes: { type: 'string', maxLength: 500, nullable: true },
    },
  },
  AttendanceResult: {
    type: 'object',
    properties: {
      enrollment: { $ref: '#/components/schemas/BlockEnrollmentDto' },
      block: { allOf: [{ $ref: '#/components/schemas/CourseBlockDto' }], nullable: true, description: 'null si el bloque dejó de existir' },
    },
  },
  StudentClassDto: {
    type: 'object',
    properties: {
      blockId: { type: 'string', format: 'uuid' },
      courseId: { type: 'string', format: 'uuid' },
      courseName: { type: 'string' },
      blockDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      startTime: { type: 'string', description: 'HH:mm' },
      durationMinutes: { type: 'integer' },
      label: { type: 'string', nullable: true },
      blockStatus: { type: 'string', enum: ['scheduled', 'completed', 'cancelled'] },
      enrollmentStatus: { type: 'string', enum: ['assigned', 'cancelled', 'completed'] },
      attended: { type: 'boolean', nullable: true },
    },
  },
  AttendanceAggregates: {
    type: 'object',
    description: 'Contadores de asistencia del alumno (una sola fuente: U1)',
    properties: {
      scheduled: { type: 'integer' },
      completed: { type: 'integer' },
      cancelled: { type: 'integer' },
      attended: { type: 'integer' },
      missed: { type: 'integer' },
      total: { type: 'integer', description: 'Todas las asignaciones del alumno' },
      attendanceRate: { type: 'number', nullable: true, description: 'attended / (attended + missed) a 3 decimales; null si no hay marcas' },
    },
  },
  AgendaError: {
    type: 'object',
    description: 'Error de negocio de la agenda',
    required: ['error', 'code'],
    properties: {
      error: { type: 'string' },
      code: {
        type: 'string',
        description: 'Código estable para la UI',
        enum: [
          'AGENDA_COURSE_ARCHIVED',
          'AGENDA_NO_SLOTS',
          'AGENDA_SLOT_DUPLICATE',
          'AGENDA_BLOCK_DUPLICATE',
          'AGENDA_BLOCK_PAST',
          'AGENDA_BLOCK_CANCELLED',
          'AGENDA_BLOCK_HAS_ENROLLMENTS',
          'AGENDA_STUDENT_NOT_ENROLLED',
          'AGENDA_CAPACITY',
        ],
      },
    },
  },
} as const;
