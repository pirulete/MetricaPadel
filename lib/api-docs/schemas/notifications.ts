/**
 * Schemas OpenAPI de Notifications + Push (inbox, preferencias, admin settings).
 * Referenciados desde lib/api-docs/paths/notifications.ts.
 */
export const notificationsSchemas = {
  PushSubscriptionInput: {
    type: 'object',
    required: ['endpoint', 'p256dh', 'auth'],
    properties: {
      endpoint: { type: 'string', description: 'Push endpoint del browser (Web Push)' },
      p256dh: { type: 'string', description: 'Clave pública P-256 del cliente' },
      auth: { type: 'string', description: 'Secreto de autenticación del cliente' },
      deviceType: { type: 'string', enum: ['desktop', 'mobile', 'tablet'] },
      browser: { type: 'string' },
      os: { type: 'string' },
    },
  },
  UnsubscribeInput: {
    type: 'object',
    required: ['endpoint'],
    properties: { endpoint: { type: 'string' } },
  },
  ClickInput: {
    type: 'object',
    required: ['endpoint'],
    properties: {
      endpoint: { type: 'string' },
      url: { type: 'string' },
      eventType: { type: 'string' },
    },
  },
  NotificationListItem: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      type: { type: 'string', enum: ['info', 'success', 'warning', 'error', 'action'] },
      priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
      title: { type: 'string' },
      body: { type: 'string', nullable: true },
      ctaUrl: { type: 'string', nullable: true },
      ctaLabel: { type: 'string', nullable: true },
      read: { type: 'integer' },
      category: { type: 'string', enum: ['system', 'account', 'billing', 'marketing', 'social', 'custom'] },
      metadata: { type: 'object', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  NotificationListResponse: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/NotificationListItem' } },
      nextCursor: { type: 'string', nullable: true },
      unread: { type: 'integer' },
    },
  },
  MarkReadInput: {
    type: 'object',
    properties: {
      ids: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 100 },
      read: { type: 'boolean', default: true },
    },
  },
  MarkSingleReadInput: {
    type: 'object',
    properties: { read: { type: 'boolean', default: true } },
  },
  PreferenceInput: {
    type: 'object',
    required: ['channel', 'category', 'enabled'],
    properties: {
      channel: { type: 'string', enum: ['inbox', 'push'] },
      category: { type: 'string', enum: ['system', 'account', 'billing', 'marketing', 'social', 'custom'] },
      enabled: { type: 'boolean' },
    },
  },
  PreferenceDto: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      channel: { type: 'string', enum: ['inbox', 'push'] },
      category: { type: 'string', enum: ['system', 'account', 'billing', 'marketing', 'social', 'custom'] },
      enabled: { type: 'boolean' },
    },
  },
  AdminNotificationSettingsInput: {
    type: 'object',
    properties: {
      pushEnabled: { type: 'boolean' },
      inboxEnabled: { type: 'boolean' },
    },
  },
  AdminNotificationSettingsResponse: {
    type: 'object',
    properties: {
      pushEnabled: { type: 'boolean' },
      inboxEnabled: { type: 'boolean' },
    },
  },
} as const;