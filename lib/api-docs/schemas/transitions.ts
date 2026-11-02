/**
 * Schemas OpenAPI del Editor de Transiciones del coach (coach/ADMIN).
 * Referenciados desde lib/api-docs/paths/transitions.ts.
 */

const transitionPoint = {
  type: 'object',
  required: ['x', 'y'],
  properties: {
    x: { type: 'number', minimum: 0, maximum: 10, description: 'Metros en el ancho de la cancha' },
    y: { type: 'number', minimum: 0, maximum: 20, description: 'Metros en la profundidad de la cancha' },
  },
} as const;

const transitionStep = {
  type: 'object',
  required: ['id', 'label', 'positions', 'shot'],
  properties: {
    id: { type: 'integer', minimum: 1 },
    label: { type: 'string', minLength: 1, maxLength: 200 },
    positions: {
      type: 'object',
      required: ['A', 'B', 'C', 'D'],
      properties: {
        A: { $ref: '#/components/schemas/TransitionPoint' },
        B: { $ref: '#/components/schemas/TransitionPoint' },
        C: { $ref: '#/components/schemas/TransitionPoint' },
        D: { $ref: '#/components/schemas/TransitionPoint' },
      },
    },
    shot: { $ref: '#/components/schemas/TransitionShot' },
  },
} as const;

export const transitionsSchemas = {
  TransitionPoint: transitionPoint,

  TransitionShot: {
    type: 'object',
    nullable: true,
    description: 'Tiro Bézier del paso; `null` cuando el paso no tiene tiro. El origen no se persiste (se deriva del paso anterior).',
    required: ['control', 'to', 'label'],
    properties: {
      control: { $ref: '#/components/schemas/TransitionPoint' },
      to: { $ref: '#/components/schemas/TransitionPoint' },
      label: { type: 'string', minLength: 1, maxLength: 40 },
    },
  },

  TransitionStep: transitionStep,

  TransitionInput: {
    type: 'object',
    required: ['title', 'initialStepIndex', 'steps'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      initialStepIndex: { type: 'integer', minimum: 0, description: 'Debe ser < steps.length' },
      steps: { type: 'array', minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/TransitionStep' } },
    },
  },

  TransitionDto: {
    type: 'object',
    required: ['id', 'title', 'initialStepIndex', 'steps', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      initialStepIndex: { type: 'integer', minimum: 0 },
      steps: { type: 'array', items: { $ref: '#/components/schemas/TransitionStep' } },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  TransitionSummary: {
    type: 'object',
    required: ['id', 'title', 'stepCount', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      stepCount: { type: 'integer', minimum: 0, description: 'Calculado en SQL (jsonb_array_length), F11' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  TransitionListResponse: {
    type: 'object',
    required: ['items', 'nextCursor'],
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/TransitionSummary' } },
      nextCursor: { type: 'string', format: 'date-time', nullable: true },
    },
  },

  TransitionDeleteResponse: {
    type: 'object',
    required: ['deleted', 'id'],
    properties: {
      deleted: { type: 'boolean', enum: [true] },
      id: { type: 'string', format: 'uuid' },
    },
  },
} as const;
