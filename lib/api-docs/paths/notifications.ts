/**
 * Paths OpenAPI de Notifications + Push (user) y settings admin.
 * Referencias a schemas en lib/api-docs/schemas/notifications.ts.
 */
export const notificationsTags = {
  name: 'Notifications',
  description: 'Inbox de notificaciones, push subscriptions (Web Push/VAPID) y preferencias del usuario autenticado (guardUser ACTIVE)',
};

export const adminNotificationsTags = {
  name: 'Notifications Admin',
  description: 'Settings globales de notificaciones (guardAdmin + auditoría)',
};

export const notificationsPaths = {
  '/api/user/push/vapid-key': {
    get: {
      tags: ['Notifications'],
      summary: 'Obtener VAPID public key',
      description: 'Expone la VAPID public key al client. 503 controlado si push está deshabilitado (sin keys).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'VAPID public key', content: { 'application/json': { schema: { type: 'object', properties: { publicKey: { type: 'string' } } } } } },
        '401': { description: 'No autenticado' },
        '503': { description: 'Push deshabilitado (VAPID no configurado)' },
      },
    },
  },
  '/api/user/push/subscription': {
    post: {
      tags: ['Notifications'],
      summary: 'Suscribir dispositivo a push',
      description: 'Upsert de subscripción Web Push por (userId, endpoint). Rate limit por IP.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PushSubscriptionInput' } } } },
      responses: {
        '201': { description: 'Subscripción creada/actualizada', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string', format: 'uuid' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '429': { description: 'Rate limit excedido' },
      },
    },
    delete: {
      tags: ['Notifications'],
      summary: 'Desuscribir dispositivo de push',
      description: 'Revoca la subscripción del endpoint indicado (status → revoked). Rate limit por IP.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/UnsubscribeInput' } } } },
      responses: {
        '200': { description: 'Subscripción revocada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '429': { description: 'Rate limit excedido' },
      },
    },
  },
  '/api/user/push/click': {
    post: {
      tags: ['Notifications'],
      summary: 'Registrar click en notificación push',
      description: 'CTR analytics. Rate limit por IP.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ClickInput' } } } },
      responses: {
        '201': { description: 'Click registrado', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '429': { description: 'Rate limit excedido' },
      },
    },
  },
  '/api/user/notifications': {
    get: {
      tags: ['Notifications'],
      summary: 'Listar notificaciones del inbox',
      description: 'Paginación por cursor (createdAt desc). Filtros category/unread. Excluye soft-deleted.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'category', in: 'query', required: false, schema: { type: 'string', enum: ['system', 'account', 'billing', 'marketing', 'social', 'custom'] } },
        { name: 'unread', in: 'query', required: false, schema: { type: 'string', enum: ['true', 'false'] } },
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50 } },
        { name: 'cursor', in: 'query', required: false, schema: { type: 'string' } },
      ],
      responses: {
        '200': { description: 'Lista paginada + unread count', content: { 'application/json': { schema: { $ref: '#/components/schemas/NotificationListResponse' } } } },
        '400': { description: 'Query inválida' },
        '401': { description: 'No autenticado' },
      },
    },
    patch: {
      tags: ['Notifications'],
      summary: 'Marcar notificaciones como leídas (batch)',
      description: 'Con ids marca esos ids; sin ids marca todas las no leídas.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MarkReadInput' } } } },
      responses: {
        '200': { description: 'Cantidad actualizada', content: { 'application/json': { schema: { type: 'object', properties: { updated: { type: 'integer' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
      },
    },
  },
  '/api/user/notifications/{id}': {
    patch: {
      tags: ['Notifications'],
      summary: 'Marcar notificación individual como leída',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/MarkSingleReadInput' } } } },
      responses: {
        '200': { description: 'Actualizada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '404': { description: 'No existe' },
      },
    },
    delete: {
      tags: ['Notifications'],
      summary: 'Soft-delete de notificación',
      description: 'Setea deletedAt (nunca DELETE físico). Audita NOTIFICATION_HIDDEN.',
      security: [{ bearerAuth: [] }],
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      responses: {
        '200': { description: 'Oculta', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '401': { description: 'No autenticado' },
        '404': { description: 'No existe' },
      },
    },
  },
  '/api/user/notifications/unread-count': {
    get: {
      tags: ['Notifications'],
      summary: 'Contar notificaciones no leídas',
      description: 'read = 0, excluye soft-deleted.',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Count', content: { 'application/json': { schema: { type: 'object', properties: { count: { type: 'integer' } } } } } },
        '401': { description: 'No autenticado' },
      },
    },
  },
  '/api/user/notifications/preferences': {
    get: {
      tags: ['Notifications'],
      summary: 'Preferencias por canal/categoría',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Preferencias', content: { 'application/json': { schema: { type: 'object', properties: { preferences: { type: 'array', items: { $ref: '#/components/schemas/PreferenceDto' } } } } } } },
        '401': { description: 'No autenticado' },
      },
    },
    put: {
      tags: ['Notifications'],
      summary: 'Actualizar preferencia (upsert)',
      description: 'UNIQUE (userId, channel, category). Desactivar push mantiene inbox.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PreferenceInput' } } } },
      responses: {
        '200': { description: 'Preferencia guardada', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
      },
    },
  },
  '/api/admin/notifications/settings': {
    get: {
      tags: ['Notifications Admin'],
      summary: 'Obtener settings globales de notificaciones',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': { description: 'Toggles globales', content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminNotificationSettingsResponse' } } } },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
    put: {
      tags: ['Notifications Admin'],
      summary: 'Actualizar settings globales',
      description: 'Actualiza pushEnabled/inboxEnabled. Audita y revalida tag settings.',
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AdminNotificationSettingsInput' } } } },
      responses: {
        '200': { description: 'Settings actualizados', content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } },
        '400': { description: 'Datos inválidos' },
        '401': { description: 'No autenticado' },
        '403': { description: 'Sin rol ADMIN' },
      },
    },
  },
} as const;