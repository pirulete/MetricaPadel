/**
 * Schemas OpenAPI del Core Evaluativo (rúbricas + evaluaciones + admin users).
 * Referenciados desde lib/api-docs/paths/padel.ts.
 */
export const padelSchemas = {
  AdminUserInput: {
    type: 'object',
    required: ['email', 'firstName', 'lastName', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string', minLength: 1, maxLength: 255 },
      lastName: { type: 'string', minLength: 1, maxLength: 255 },
      password: { type: 'string', minLength: 8, description: 'Contraseña (mínimo 8 caracteres)' },
    },
  },
  AdminUserDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      role: { type: 'string', enum: ['USER', 'ADMIN'] },
      status: { type: 'string', enum: ['TEMPORARY', 'ACTIVE', 'LOCKED'] },
    },
  },
  RubricInput: {
    type: 'object',
    required: ['title', 'category', 'criteria'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      category: { type: 'string', enum: ['tecnica', 'tactica', 'fisica', 'actitud'] },
      criteria: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          required: ['name', 'descriptors'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            descriptors: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: { type: 'string', minLength: 1, maxLength: 1000 },
              description: 'Exactamente 4 descriptores (niveles fijos)',
            },
          },
        },
      },
    },
  },
  RubricDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      category: { type: 'string', enum: ['tecnica', 'tactica', 'fisica', 'actitud'] },
      status: { type: 'string', enum: ['draft', 'active', 'archived'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  RubricListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      category: { type: 'string', enum: ['tecnica', 'tactica', 'fisica', 'actitud'] },
      status: { type: 'string', enum: ['draft', 'active', 'archived'] },
      criteriaCount: { type: 'integer' },
      levelCount: { type: 'integer' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  RubricDetail: {
    type: 'object',
    properties: {
      rubric: { $ref: '#/components/schemas/RubricDto' },
      levels: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            score: { type: 'integer' },
            sortOrder: { type: 'integer' },
          },
        },
      },
      criteria: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            sortOrder: { type: 'integer' },
          },
        },
      },
      descriptors: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            criteriaId: { type: 'string', format: 'uuid' },
            levelId: { type: 'string', format: 'uuid' },
            text: { type: 'string' },
          },
        },
      },
    },
  },
  EvaluationCreateInput: {
    type: 'object',
    required: ['studentId', 'rubricId'],
    properties: {
      studentId: { type: 'string', format: 'uuid' },
      rubricId: { type: 'string', format: 'uuid' },
    },
  },
  EvaluationSaveInput: {
    type: 'object',
    required: ['scores'],
    properties: {
      scores: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          required: ['criteriaId', 'levelId'],
          properties: {
            criteriaId: { type: 'string', format: 'uuid' },
            levelId: { type: 'string', format: 'uuid' },
            comment: { type: 'string', maxLength: 2000 },
          },
        },
      },
      globalComment: { type: 'string', maxLength: 5000 },
    },
  },
  EvaluationDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      studentId: { type: 'string', format: 'uuid' },
      teacherId: { type: 'string', format: 'uuid' },
      rubricId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['draft', 'published'] },
      totalScore: { type: 'integer', nullable: true },
      maxScore: { type: 'integer', nullable: true },
      globalComment: { type: 'string', nullable: true },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      readAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  EvaluationListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      studentId: { type: 'string', format: 'uuid' },
      studentName: { type: 'string' },
      rubricTitle: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'published'] },
      totalScore: { type: 'integer', nullable: true },
      maxScore: { type: 'integer', nullable: true },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  EvaluationDetail: {
    type: 'object',
    properties: {
      evaluation: { $ref: '#/components/schemas/EvaluationDto' },
      student: { $ref: '#/components/schemas/AdminUserDto' },
      rubric: { $ref: '#/components/schemas/RubricDto' },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            criteriaId: { type: 'string', format: 'uuid' },
            levelId: { type: 'string', format: 'uuid' },
            score: { type: 'integer' },
            comment: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
  StudentEvaluationListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      rubricTitle: { type: 'string' },
      category: { type: 'string', enum: ['tecnica', 'tactica', 'fisica', 'actitud'] },
      totalScore: { type: 'integer', nullable: true },
      maxScore: { type: 'integer', nullable: true },
      publishedAt: { type: 'string', format: 'date-time', nullable: true },
      readAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  StudentEvaluationDetail: {
    type: 'object',
    properties: {
      evaluation: { $ref: '#/components/schemas/EvaluationDto' },
      rubric: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          category: { type: 'string', enum: ['tecnica', 'tactica', 'fisica', 'actitud'] },
        },
      },
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criteriaId: { type: 'string', format: 'uuid' },
            criterionName: { type: 'string', nullable: true },
            levelId: { type: 'string', format: 'uuid' },
            levelName: { type: 'string', nullable: true },
            score: { type: 'integer' },
            descriptor: { type: 'string', nullable: true },
            comment: { type: 'string', nullable: true },
          },
        },
      },
    },
  },
} as const;