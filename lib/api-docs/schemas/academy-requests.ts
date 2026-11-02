/**
 * Schemas OpenAPI de Solicitudes de Acceso a Academia (v0.9).
 * Referenciados desde lib/api-docs/paths/academy-requests.ts.
 */
export const academyRequestsSchemas = {
  AcademyRequestInput: {
    type: 'object',
    oneOf: [
      {
        type: 'object',
        required: ['type', 'academyId', 'requestedRole'],
        properties: {
          type: { type: 'string', enum: ['join_academy'] },
          academyId: { type: 'string', format: 'uuid' },
          requestedRole: { type: 'string', enum: ['ADMIN', 'COACH'] },
        },
      },
      {
        type: 'object',
        required: ['type', 'name', 'slug'],
        properties: {
          type: { type: 'string', enum: ['create_academy'] },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          slug: { type: 'string', pattern: '^[a-z0-9-]{3,50}$' },
          primaryColor: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' },
          requestedRole: { type: 'string', enum: ['OWNER'] },
        },
      },
    ],
  },
  AcademyRequestDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['join_academy', 'create_academy'] },
      academyId: { type: 'string', format: 'uuid', nullable: true },
      requestedRole: { type: 'string', enum: ['OWNER', 'ADMIN', 'COACH'] },
      payload: { type: 'object', description: 'create_academy: {name, slug, primaryColor?}' },
      status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
      reviewedBy: { type: 'string', format: 'uuid', nullable: true },
      reviewedAt: { type: 'string', format: 'date-time', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      requesterEmail: { type: 'string', nullable: true },
      requesterFirstName: { type: 'string', nullable: true },
      requesterLastName: { type: 'string', nullable: true },
      academyName: { type: 'string', nullable: true },
      academySlug: { type: 'string', nullable: true },
    },
  },
  AcademyRequestQuery: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
      type: { type: 'string', enum: ['join_academy', 'create_academy'] },
    },
  },
  AvailableAcademyDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      slug: { type: 'string' },
    },
  },
} as const