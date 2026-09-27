/**
 * Schemas OpenAPI de Academias, Miembros y Rúbricas institucionales
 * (SPEC-EPIC-01). Referenciados desde lib/api-docs/paths/academies.ts.
 */
export const academiesSchemas = {
  AcademyInput: {
    type: 'object',
    required: ['name', 'slug'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      slug: { type: 'string', pattern: '^[a-z0-9-]{3,50}$', description: 'Minúsculas, dígitos y guiones' },
      primaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$', description: 'HEX #RRGGBB' },
    },
  },
  AcademyDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      ownerId: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      slug: { type: 'string' },
      logoUrl: { type: 'string', nullable: true, description: 'Data-URL PNG/SVG o URL externa' },
      primaryColor: { type: 'string' },
      status: { type: 'string', enum: ['active', 'archived'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  AcademyListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      slug: { type: 'string' },
      logoUrl: { type: 'string', nullable: true },
      primaryColor: { type: 'string' },
      status: { type: 'string', enum: ['active', 'archived'] },
      createdAt: { type: 'string', format: 'date-time' },
      role: { type: 'string', enum: ['OWNER', 'ADMIN', 'COACH'], description: 'Rol del caller en la academia' },
      memberCount: { type: 'integer' },
    },
  },
  AcademyDetail: {
    type: 'object',
    properties: {
      academy: { $ref: '#/components/schemas/AcademyDto' },
      myRole: { type: 'string', enum: ['OWNER', 'ADMIN', 'COACH'], nullable: true },
    },
  },
  MemberInviteInput: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
    },
  },
  MemberDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      role: { type: 'string', enum: ['OWNER', 'ADMIN', 'COACH'] },
      status: { type: 'string', enum: ['pending', 'active', 'removed'] },
      invitedBy: { type: 'string', format: 'uuid', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      email: { type: 'string' },
    },
  },
  AcademyRubricInput: {
    type: 'object',
    required: ['title', 'category', 'criteria'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 200 },
      category: { type: 'string', enum: ['reglas', 'tecnica_basica', 'tecnica_especifica', 'tactica', 'fisica', 'actitud_equipo'] },
      criteria: {
        type: 'array',
        minItems: 1,
        maxItems: 50,
        items: {
          type: 'object',
          required: ['name', 'descriptors'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            descriptors: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'string', minLength: 1, maxLength: 1000 } },
          },
        },
      },
    },
  },
  AcademyRubricListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      category: { type: 'string' },
      status: { type: 'string', enum: ['draft', 'active', 'archived'] },
      scope: { type: 'string', enum: ['personal', 'institutional'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      criteriaCount: { type: 'integer' },
    },
  },
} as const