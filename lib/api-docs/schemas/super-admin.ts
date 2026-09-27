/**
 * Schemas OpenAPI de Super Admin (plataforma): admins, audit logs y academias globales.
 * Referenciados desde lib/api-docs/paths/super-admin.ts.
 */
export const superAdminSchemas = {
  AdminDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', format: 'email' },
      firstName: { type: 'string', nullable: true },
      lastName: { type: 'string', nullable: true },
      role: { type: 'string', enum: ['ADMIN', 'SUPER_ADMIN'] },
      status: { type: 'string', enum: ['TEMPORARY', 'ACTIVE', 'LOCKED'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  AuditLogDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      userId: { type: 'string', format: 'uuid', nullable: true },
      actionType: { type: 'string', description: 'Tipo de acción auditada (ej: ADMIN_PROMOTED, ADMIN_DEMOTED, UPDATE)' },
      entityName: { type: 'string' },
      entityId: { type: 'string' },
      oldValues: { type: 'object', nullable: true },
      newValues: { type: 'object', nullable: true },
      metadata: { type: 'object', nullable: true },
      ipAddress: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      userEmail: { type: 'string', format: 'email', nullable: true },
      userFirstName: { type: 'string', nullable: true },
      userLastName: { type: 'string', nullable: true },
    },
  },
  AuditLogsResponse: {
    type: 'object',
    properties: {
      logs: { type: 'array', items: { $ref: '#/components/schemas/AuditLogDto' } },
      pagination: {
        type: 'object',
        properties: {
          page: { type: 'integer' },
          pageSize: { type: 'integer' },
          total: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
    },
  },
  AcademyGlobalDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      slug: { type: 'string' },
      status: { type: 'string', enum: ['active', 'archived'] },
      primaryColor: { type: 'string' },
      ownerId: { type: 'string', format: 'uuid' },
      createdAt: { type: 'string', format: 'date-time' },
      ownerEmail: { type: 'string', format: 'email', nullable: true },
      ownerFirstName: { type: 'string', nullable: true },
      ownerLastName: { type: 'string', nullable: true },
      memberCount: { type: 'integer', description: 'Miembros activos de la academia' },
      rubricCount: { type: 'integer', description: 'Rúbricas institucionales de la academia' },
    },
  },
} as const;