import { z } from "zod";

export const notificationCategoryValues = [
  "system",
  "account",
  "billing",
  "marketing",
  "social",
  "custom",
] as const;

export const notificationChannelValues = ["inbox", "push"] as const;

/** POST /api/user/push/subscription — payload de Web Push (VAPID). */
export const subscribeSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint es requerido").max(1000),
  p256dh: z.string().trim().min(1, "p256dh es requerido").max(500),
  auth: z.string().trim().min(1, "auth es requerido").max(500),
  deviceType: z.string().trim().max(20).optional(),
  browser: z.string().trim().max(50).optional(),
  os: z.string().trim().max(50).optional(),
});

/** DELETE /api/user/push/subscription — revoca por endpoint. */
export const unsubscribeSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint es requerido").max(1000),
});

/** POST /api/user/push/click — CTR analytics. */
export const clickSchema = z.object({
  endpoint: z.string().trim().min(1, "endpoint es requerido").max(1000),
  url: z.string().trim().max(500).optional(),
  eventType: z.string().trim().max(50).optional(),
});

/** GET /api/user/notifications — query params de listado paginado. */
export const notificationQuerySchema = z.object({
  category: z.enum(notificationCategoryValues).optional(),
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().trim().min(1).optional(),
});

/** PATCH /api/user/notifications — batch mark-read. */
export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(100).optional(),
  read: z.boolean().default(true),
});

/** PATCH /api/user/notifications/[id] — mark single read. */
export const markSingleReadSchema = z.object({
  read: z.boolean().default(true),
});

/** Params de ruta [id] (uuid). */
export const notificationIdParamsSchema = z.object({
  id: z.string().uuid("id debe ser un uuid válido"),
});

/** PUT /api/user/notifications/preferences — toggle canal/categoría. */
export const preferenceSchema = z.object({
  channel: z.enum(notificationChannelValues),
  category: z.enum(notificationCategoryValues),
  enabled: z.boolean(),
});

/** PUT /api/admin/notifications/settings — toggles globales. */
export const adminNotificationSettingsSchema = z.object({
  pushEnabled: z.boolean().optional(),
  inboxEnabled: z.boolean().optional(),
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;
export type UnsubscribeInput = z.infer<typeof unsubscribeSchema>;
export type ClickInput = z.infer<typeof clickSchema>;
export type NotificationQueryInput = z.infer<typeof notificationQuerySchema>;
export type MarkReadInput = z.infer<typeof markReadSchema>;
export type PreferenceInput = z.infer<typeof preferenceSchema>;
export type AdminNotificationSettingsInput = z.infer<typeof adminNotificationSettingsSchema>;