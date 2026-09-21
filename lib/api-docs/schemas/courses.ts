/**
 * Schemas OpenAPI de Cursos, Dashboard y Historial (Etapa 2+3).
 * Referenciados desde lib/api-docs/paths/courses.ts.
 */
export const coursesSchemas = {
  CourseInput: {
    type: 'object',
    required: ['name', 'level'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      level: { type: 'string', enum: ['iniciacion', 'intermedio', 'avanzado'] },
      schedule: { type: 'string', maxLength: 100, description: 'Texto horario, ej "18:00"' },
      days: {
        type: 'array',
        maxItems: 7,
        items: { type: 'string', maxLength: 10 },
        description: 'Días de clase, ej ["Lun","Mié"]. Vacío permitido (D3)',
      },
    },
  },
  CourseDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      ownerId: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      level: { type: 'string', enum: ['iniciacion', 'intermedio', 'avanzado'] },
      schedule: { type: 'string', nullable: true },
      days: { type: 'array', items: { type: 'string' } },
      inviteCode: { type: 'string', description: 'Formato PAD-XXXX mayúsculas' },
      status: { type: 'string', enum: ['active', 'archived'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CourseListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      level: { type: 'string', enum: ['iniciacion', 'intermedio', 'avanzado'] },
      schedule: { type: 'string', nullable: true },
      days: { type: 'array', items: { type: 'string' } },
      inviteCode: { type: 'string' },
      status: { type: 'string', enum: ['active', 'archived'] },
      studentCount: { type: 'integer' },
    },
  },
  CourseDetail: {
    type: 'object',
    properties: {
      course: { $ref: '#/components/schemas/CourseDto' },
      students: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            firstName: { type: 'string', nullable: true },
            lastName: { type: 'string', nullable: true },
            email: { type: 'string', format: 'email' },
            joinedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      rubrics: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            rubricId: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            assignedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  JoinInput: {
    type: 'object',
    required: ['inviteCode'],
    properties: {
      inviteCode: { type: 'string', description: 'Formato PAD-XXXX, case-insensitive (se normaliza a mayúsculas)' },
    },
  },
  EnrollmentDto: {
    type: 'object',
    properties: {
      courseId: { type: 'string', format: 'uuid' },
      courseName: { type: 'string' },
      joinedAt: { type: 'string', format: 'date-time' },
    },
  },
  RubricAssignInput: {
    type: 'object',
    required: ['rubricId'],
    properties: {
      rubricId: { type: 'string', format: 'uuid' },
    },
  },
  CourseStudentAddInput: {
    type: 'object',
    required: ['studentId'],
    properties: {
      studentId: { type: 'string', format: 'uuid' },
    },
  },
  CourseEnrollmentDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      courseId: { type: 'string', format: 'uuid' },
      studentId: { type: 'string', format: 'uuid' },
      joinedAt: { type: 'string', format: 'date-time' },
    },
  },
  CourseStudentCandidateDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      email: { type: 'string', format: 'email' },
    },
  },
  CourseRubricDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      courseId: { type: 'string', format: 'uuid' },
      rubricId: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      category: { type: 'string', enum: ['reglas', 'tecnica_basica', 'tecnica_especifica', 'tactica', 'fisica', 'actitud_equipo'] },
      assignedAt: { type: 'string', format: 'date-time' },
    },
  },
  TeacherDashboardDto: {
    type: 'object',
    properties: {
      metrics: {
        type: 'object',
        properties: {
          students: { type: 'integer' },
          evaluations: { type: 'integer' },
          average: { type: 'number', nullable: true, description: 'null si no hay publicadas (UI muestra "—")' },
          classesToday: { type: 'integer' },
        },
      },
      courses: { type: 'array', items: { $ref: '#/components/schemas/CourseListItem' } },
    },
  },
  StudentDashboardDto: {
    type: 'object',
    properties: {
      level: { type: 'string', enum: ['iniciacion', 'intermedio', 'avanzado'], nullable: true },
      courses: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            level: { type: 'string', enum: ['iniciacion', 'intermedio', 'avanzado'] },
            schedule: { type: 'string', nullable: true },
            days: { type: 'array', items: { type: 'string' } },
            inviteCode: { type: 'string' },
            joinedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      notifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            body: { type: 'string', nullable: true },
            read: { type: 'integer', enum: [0, 1] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  },
  HistoryItemDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      studentName: { type: 'string' },
      rubricTitle: { type: 'string' },
      courseName: { type: 'string', nullable: true },
      date: { type: 'string', format: 'date-time', nullable: true },
      totalScore: { type: 'integer', nullable: true },
      maxScore: { type: 'integer', nullable: true },
      status: { type: 'string', enum: ['draft', 'published'] },
    },
  },
} as const;