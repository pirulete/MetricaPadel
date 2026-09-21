import { pgTable, text, timestamp, uuid, varchar, json, jsonb, integer, numeric, boolean, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN']);

export const marketingStatusEnum = pgEnum('marketing_status', ['draft', 'published']);

export const marketingBlockTypeEnum = pgEnum('marketing_block_type', [
  'hero', 'features_grid', 'pricing', 'testimonials', 'cta_banner', 'faq', 'contact_form', 'stats', 'product_grid', 'blog_list'
]);

export const userStatusValues = ['TEMPORARY', 'ACTIVE', 'LOCKED'] as const;
export type UserStatus = (typeof userStatusValues)[number];

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  phone: varchar("phone", { length: 20 }),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("TEMPORARY"),
  role: userRoleEnum("role").notNull().default('USER'),
  failedAttempts: integer("failed_attempts").notNull().default(0),
  emailVerifiedAt: timestamp("email_verified_at"),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  lastActivityAt: timestamp("last_activity_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const emailVerifications = pgTable("email_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  code: varchar("code", { length: 6 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  deviceInfo: text("device_info"),
  ipAddress: varchar("ip_address", { length: 45 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastActivityAt: timestamp("last_activity_at").notNull().defaultNow(),
});

// Configuración singleton de sesión (TTL configurable vía DB o env fallback).
// Portado desde StreetMove (auth-sync): el TTL real del access token se lee
// aquí en lugar de hardcodear 15 min en auth.ts.
export const sessionConfig = pgTable("session_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  accessTokenTtl: integer("access_token_ttl").notNull().default(15),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  actionType: varchar("action_type", { length: 50 }).notNull(),
  entityName: varchar("entity_name", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 100 }).notNull(),
  oldValues: json("old_values"),
  newValues: json("new_values"),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Marketing CMS (v0.1)
// ---------------------------------------------------------------------------

export const marketingPages = pgTable("marketing_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  seoTitle: varchar("seo_title", { length: 200 }),
  seoDescription: text("seo_description"),
  status: marketingStatusEnum("status").notNull().default('draft'),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketingSections = pgTable("marketing_sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  pageId: uuid("page_id").notNull().references(() => marketingPages.id, { onDelete: "cascade" }),
  blockType: marketingBlockTypeEnum("block_type").notNull(),
  config: jsonb("config").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("marketing_sections_page_sort_idx").on(table.pageId, table.sortOrder),
]);

export const marketingPosts = pgTable("marketing_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  title: varchar("title", { length: 200 }).notNull(),
  excerpt: text("excerpt"),
  content: jsonb("content").notNull(),
  coverImage: varchar("cover_image", { length: 500 }),
  publishedAt: timestamp("published_at"),
  status: marketingStatusEnum("status").notNull().default('draft'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketingCategories = pgTable("marketing_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const marketingProducts = pgTable("marketing_products", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 200 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  compareAtPrice: numeric("compare_at_price", { precision: 10, scale: 2 }),
  images: jsonb("images"),
  categoryId: uuid("category_id").references(() => marketingCategories.id, { onDelete: "set null" }),
  status: marketingStatusEnum("status").notNull().default('draft'),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("marketing_products_category_idx").on(table.categoryId),
]);

export const marketingSettings = pgTable("marketing_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  auditLogs: many(auditLogs),
  termsAcceptances: many(userTermsAcceptance),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  notificationPreferences: many(notificationPreferences),
  rubrics: many(rubrics),
  courses: many(courses),
  courseEnrollments: many(courseEnrollments),
  courseRubricsAssigned: many(courseRubrics),
  evaluationsAsStudent: many(evaluations, { relationName: "studentEvaluations" }),
  evaluationsAsTeacher: many(evaluations, { relationName: "teacherEvaluations" }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  user: one(users, {
    fields: [auditLogs.userId],
    references: [users.id],
  }),
}));

export const marketingPagesRelations = relations(marketingPages, ({ many }) => ({
  sections: many(marketingSections),
}));

export const marketingSectionsRelations = relations(marketingSections, ({ one }) => ({
  page: one(marketingPages, {
    fields: [marketingSections.pageId],
    references: [marketingPages.id],
  }),
}));

export const marketingCategoriesRelations = relations(marketingCategories, ({ many }) => ({
  products: many(marketingProducts),
}));

export const marketingProductsRelations = relations(marketingProducts, ({ one }) => ({
  category: one(marketingCategories, {
    fields: [marketingProducts.categoryId],
    references: [marketingCategories.id],
  }),
}));

// ---------------------------------------------------------------------------
// Terms & Conditions (v0.2 — streetmove-sync-port)
// ---------------------------------------------------------------------------

export const termsVersions = pgTable("terms_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionNumber: integer("version_number").notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  summary: text("summary"),
  isCurrent: integer("is_current").notNull().default(0),
  isBlocking: integer("is_blocking").notNull().default(1),
  publishedAt: timestamp("published_at"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userTermsAcceptance = pgTable("user_terms_acceptance", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  termsVersionId: uuid("terms_version_id").notNull().references(() => termsVersions.id, { onDelete: "cascade" }),
  acceptedAt: timestamp("accepted_at").notNull().defaultNow(),
  ipAddress: varchar("ip_address", { length: 45 }),
  userAgent: text("user_agent"),
}, (t) => [
  uniqueIndex("idx_user_terms_unique").on(t.userId, t.termsVersionId),
]);

export const termsVersionsRelations = relations(termsVersions, ({ one, many }) => ({
  creator: one(users, {
    fields: [termsVersions.createdBy],
    references: [users.id],
  }),
  acceptances: many(userTermsAcceptance),
}));

export const userTermsAcceptanceRelations = relations(userTermsAcceptance, ({ one }) => ({
  user: one(users, {
    fields: [userTermsAcceptance.userId],
    references: [users.id],
  }),
  termsVersion: one(termsVersions, {
    fields: [userTermsAcceptance.termsVersionId],
    references: [termsVersions.id],
  }),
}));

export type TermsVersion = typeof termsVersions.$inferSelect;
export type NewTermsVersion = typeof termsVersions.$inferInsert;
export type UserTermsAcceptance = typeof userTermsAcceptance.$inferSelect;
export type NewUserTermsAcceptance = typeof userTermsAcceptance.$inferInsert;

// ---------------------------------------------------------------------------
// Push Notifications + Notification Inbox (v0.3 — push-notifications)
// ---------------------------------------------------------------------------

export const notificationTypeEnum = pgEnum('notification_type_enum', [
  'info', 'success', 'warning', 'error', 'action',
]);

export const notificationPriorityEnum = pgEnum('notification_priority_enum', [
  'P1', 'P2', 'P3',
]);

export const notificationCategoryEnum = pgEnum('notification_category_enum', [
  'system', 'account', 'billing', 'marketing', 'social', 'custom',
]);

export const pushSubscriptionStatusEnum = pgEnum('push_subscription_status', [
  'active', 'revoked', 'expired',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'inbox', 'push',
]);

export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type NotificationPriority = (typeof notificationPriorityEnum.enumValues)[number];
export type NotificationCategory = (typeof notificationCategoryEnum.enumValues)[number];
export type PushSubscriptionStatus = (typeof pushSubscriptionStatusEnum.enumValues)[number];
export type NotificationChannel = (typeof notificationChannelEnum.enumValues)[number];

// Inbox de notificaciones (inbox-first: toda notificación se persiste aquí;
// push es canal de delivery adicional, no la fuente).
export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: notificationTypeEnum("type").notNull(),
  priority: notificationPriorityEnum("priority").notNull().default('P2'),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  ctaUrl: varchar("cta_url", { length: 500 }),
  ctaLabel: varchar("cta_label", { length: 50 }),
  read: integer("read").notNull().default(0),
  groupId: uuid("group_id"),
  category: notificationCategoryEnum("category").notNull().default('system'),
  deletedAt: timestamp("deleted_at"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => [
  index("notifications_user_deleted_idx").on(table.userId, table.deletedAt),
  index("notifications_category_idx").on(table.category),
]);

// Subscripciones push (Web Push / VAPID). UNIQUE (userId, endpoint) evita
// duplicados por dispositivo; status controla revoke/expired.
export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  deviceType: varchar("device_type", { length: 20 }).notNull().default('desktop'),
  browser: varchar("browser", { length: 50 }),
  os: varchar("os", { length: 50 }),
  status: pushSubscriptionStatusEnum("status").notNull().default('active'),
  lastActiveAt: timestamp("last_active_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("push_subscriptions_user_endpoint_idx").on(table.userId, table.endpoint),
  index("push_subscriptions_user_status_idx").on(table.userId, table.status),
  index("push_subscriptions_status_idx").on(table.status),
  index("push_subscriptions_endpoint_idx").on(table.endpoint),
]);

// CTR analytics de clicks en notificaciones push.
export const pushClickEvents = pgTable("push_click_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  endpoint: text("endpoint").notNull(),
  url: varchar("url", { length: 500 }),
  eventType: varchar("event_type", { length: 50 }),
  clickedAt: timestamp("clicked_at").notNull().defaultNow(),
}, (table) => [
  index("push_click_events_user_clicked_idx").on(table.userId, table.clickedAt),
]);

// Preferencias por canal/categoría. UNIQUE (userId, channel, category):
// desactivar push mantiene inbox.
export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  channel: notificationChannelEnum("channel").notNull(),
  category: notificationCategoryEnum("category").notNull(),
  enabled: boolean("enabled").notNull().default(true),
}, (table) => [
  uniqueIndex("notification_preferences_user_channel_category_idx").on(table.userId, table.channel, table.category),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const pushClickEventsRelations = relations(pushClickEvents, ({ one }) => ({
  user: one(users, {
    fields: [pushClickEvents.userId],
    references: [users.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  user: one(users, {
    fields: [notificationPreferences.userId],
    references: [users.id],
  }),
}));

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type PushClickEvent = typeof pushClickEvents.$inferSelect;
export type NewPushClickEvent = typeof pushClickEvents.$inferInsert;
export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

// ---------------------------------------------------------------------------
// Padel Evaluativo — Core (v0.1 — etapa1-core-evaluativo)
// ---------------------------------------------------------------------------

export const rubricCategoryEnum = pgEnum('rubric_category', [
  'tecnica', 'tactica', 'fisica', 'actitud',
]);

export const rubricStatusEnum = pgEnum('rubric_status', [
  'draft', 'active', 'archived',
]);

export const evaluationStatusEnum = pgEnum('evaluation_status', [
  'draft', 'published',
]);

export type RubricCategory = (typeof rubricCategoryEnum.enumValues)[number];
export type RubricStatus = (typeof rubricStatusEnum.enumValues)[number];
export type EvaluationStatus = (typeof evaluationStatusEnum.enumValues)[number];

export const courseLevelEnum = pgEnum('course_level', [
  'iniciacion', 'intermedio', 'avanzado',
]);

export const courseStatusEnum = pgEnum('course_status', [
  'active', 'archived',
]);

export type CourseLevel = (typeof courseLevelEnum.enumValues)[number];
export type CourseStatus = (typeof courseStatusEnum.enumValues)[number];

// Rúbrica del coach (ADMIN). ownerId = coach. Archivar = soft (status=archived),
// nunca hard delete: las evaluaciones referencian la rúbrica.
export const rubrics = pgTable("rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  title: varchar("title", { length: 200 }).notNull(),
  category: rubricCategoryEnum("category").notNull(),
  status: rubricStatusEnum("status").notNull().default('draft'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("rubrics_owner_idx").on(table.ownerId),
]);

// Curso del coach (ADMIN). ownerId = coach. Archivar = soft (status=archived);
// enrollments y course_rubrics se conservan (historial protegido, D7).
export const courses = pgTable("courses", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  name: varchar("name", { length: 200 }).notNull(),
  level: courseLevelEnum("level").notNull(),
  schedule: varchar("schedule", { length: 100 }),
  days: jsonb("days").notNull().default([]),
  inviteCode: varchar("invite_code", { length: 10 }).notNull(),
  status: courseStatusEnum("status").notNull().default('active'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("courses_owner_idx").on(table.ownerId),
  uniqueIndex("courses_invite_code_idx").on(table.inviteCode),
]);

// Niveles fijos 4 en Etapa 1 (Excelente 4 / Bueno 3 / Aceptable 2 / En desarrollo 1).
export const rubricLevels = pgTable("rubric_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 100 }).notNull(),
  score: integer("score").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  index("rubric_levels_rubric_idx").on(table.rubricId),
]);

export const rubricCriteria = pgTable("rubric_criteria", {
  id: uuid("id").primaryKey().defaultRandom(),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 200 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  index("rubric_criteria_rubric_idx").on(table.rubricId),
]);

// Descriptor por (criterio, nivel). UNIQUE evita duplicados en la matriz.
export const rubricDescriptors = pgTable("rubric_descriptors", {
  id: uuid("id").primaryKey().defaultRandom(),
  criteriaId: uuid("criteria_id").notNull().references(() => rubricCriteria.id, { onDelete: "cascade" }),
  levelId: uuid("level_id").notNull().references(() => rubricLevels.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
}, (table) => [
  uniqueIndex("rubric_descriptors_criteria_level_idx").on(table.criteriaId, table.levelId),
]);

// Evaluación: coach (teacherId) evalúa a alumno (studentId) con una rúbrica.
// totalScore/maxScore denormalizados → historial estable ante ediciones de rúbrica.
export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "no action" }),
  teacherId: uuid("teacher_id").notNull().references(() => users.id, { onDelete: "no action" }),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id, { onDelete: "no action" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  status: evaluationStatusEnum("status").notNull().default('draft'),
  totalScore: integer("total_score"),
  maxScore: integer("max_score"),
  globalComment: text("global_comment"),
  publishedAt: timestamp("published_at"),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("evaluations_student_idx").on(table.studentId),
  index("evaluations_teacher_idx").on(table.teacherId),
  index("evaluations_rubric_idx").on(table.rubricId),
]);

// Scores por criterio. FKs a criteria/levels SIN cascade: si se edita la rúbrica,
// los scores apuntan a filas que siguen existiendo (historial protegido).
export const evaluationScores = pgTable("evaluation_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  evaluationId: uuid("evaluation_id").notNull().references(() => evaluations.id, { onDelete: "cascade" }),
  criteriaId: uuid("criteria_id").notNull().references(() => rubricCriteria.id, { onDelete: "no action" }),
  levelId: uuid("level_id").notNull().references(() => rubricLevels.id, { onDelete: "no action" }),
  score: integer("score").notNull(),
  comment: text("comment"),
}, (table) => [
  uniqueIndex("evaluation_scores_evaluation_criteria_idx").on(table.evaluationId, table.criteriaId),
]);

// Inscripción de alumno (USER) a un curso. UNIQUE (courseId, studentId) evita
// duplicados; cascade en courseId (archivar curso conserva, borrar curso limpia).
export const courseEnrollments = pgTable("course_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "no action" }),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("course_enrollments_course_student_idx").on(table.courseId, table.studentId),
  index("course_enrollments_course_idx").on(table.courseId),
  index("course_enrollments_student_idx").on(table.studentId),
]);

// Rúbrica asignada a un curso (P08). UNIQUE (courseId, rubricId) → re-asignar
// la misma rúbrica da 409 (D2). rubricId sin cascade: historial protegido.
export const courseRubrics = pgTable("course_rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id, { onDelete: "no action" }),
  assignedById: uuid("assigned_by_id").notNull().references(() => users.id, { onDelete: "no action" }),
  assignedAt: timestamp("assigned_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("course_rubrics_course_rubric_idx").on(table.courseId, table.rubricId),
  index("course_rubrics_course_idx").on(table.courseId),
]);

export const rubricsRelations = relations(rubrics, ({ one, many }) => ({
  owner: one(users, {
    fields: [rubrics.ownerId],
    references: [users.id],
  }),
  levels: many(rubricLevels),
  criteria: many(rubricCriteria),
  evaluations: many(evaluations),
  courseRubrics: many(courseRubrics),
}));

export const rubricLevelsRelations = relations(rubricLevels, ({ one, many }) => ({
  rubric: one(rubrics, {
    fields: [rubricLevels.rubricId],
    references: [rubrics.id],
  }),
  descriptors: many(rubricDescriptors),
}));

export const rubricCriteriaRelations = relations(rubricCriteria, ({ one, many }) => ({
  rubric: one(rubrics, {
    fields: [rubricCriteria.rubricId],
    references: [rubrics.id],
  }),
  descriptors: many(rubricDescriptors),
  scores: many(evaluationScores),
}));

export const rubricDescriptorsRelations = relations(rubricDescriptors, ({ one }) => ({
  criterion: one(rubricCriteria, {
    fields: [rubricDescriptors.criteriaId],
    references: [rubricCriteria.id],
  }),
  level: one(rubricLevels, {
    fields: [rubricDescriptors.levelId],
    references: [rubricLevels.id],
  }),
}));

export const evaluationsRelations = relations(evaluations, ({ one, many }) => ({
  student: one(users, {
    relationName: "studentEvaluations",
    fields: [evaluations.studentId],
    references: [users.id],
  }),
  teacher: one(users, {
    relationName: "teacherEvaluations",
    fields: [evaluations.teacherId],
    references: [users.id],
  }),
  rubric: one(rubrics, {
    fields: [evaluations.rubricId],
    references: [rubrics.id],
  }),
  course: one(courses, {
    fields: [evaluations.courseId],
    references: [courses.id],
  }),
  scores: many(evaluationScores),
}));

export const evaluationScoresRelations = relations(evaluationScores, ({ one }) => ({
  evaluation: one(evaluations, {
    fields: [evaluationScores.evaluationId],
    references: [evaluations.id],
  }),
  criterion: one(rubricCriteria, {
    fields: [evaluationScores.criteriaId],
    references: [rubricCriteria.id],
  }),
  level: one(rubricLevels, {
    fields: [evaluationScores.levelId],
    references: [rubricLevels.id],
  }),
}));

export const coursesRelations = relations(courses, ({ one, many }) => ({
  owner: one(users, {
    fields: [courses.ownerId],
    references: [users.id],
  }),
  enrollments: many(courseEnrollments),
  rubrics: many(courseRubrics),
}));

export const courseEnrollmentsRelations = relations(courseEnrollments, ({ one }) => ({
  course: one(courses, {
    fields: [courseEnrollments.courseId],
    references: [courses.id],
  }),
  student: one(users, {
    fields: [courseEnrollments.studentId],
    references: [users.id],
  }),
}));

export const courseRubricsRelations = relations(courseRubrics, ({ one }) => ({
  course: one(courses, {
    fields: [courseRubrics.courseId],
    references: [courses.id],
  }),
  rubric: one(rubrics, {
    fields: [courseRubrics.rubricId],
    references: [rubrics.id],
  }),
  assignedBy: one(users, {
    fields: [courseRubrics.assignedById],
    references: [users.id],
  }),
}));

export type Rubric = typeof rubrics.$inferSelect;
export type NewRubric = typeof rubrics.$inferInsert;
export type RubricLevel = typeof rubricLevels.$inferSelect;
export type NewRubricLevel = typeof rubricLevels.$inferInsert;
export type RubricCriterion = typeof rubricCriteria.$inferSelect;
export type NewRubricCriterion = typeof rubricCriteria.$inferInsert;
export type RubricDescriptor = typeof rubricDescriptors.$inferSelect;
export type NewRubricDescriptor = typeof rubricDescriptors.$inferInsert;
export type Evaluation = typeof evaluations.$inferSelect;
export type NewEvaluation = typeof evaluations.$inferInsert;
export type EvaluationScore = typeof evaluationScores.$inferSelect;
export type NewEvaluationScore = typeof evaluationScores.$inferInsert;
export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseEnrollment = typeof courseEnrollments.$inferSelect;
export type NewCourseEnrollment = typeof courseEnrollments.$inferInsert;
export type CourseRubric = typeof courseRubrics.$inferSelect;
export type NewCourseRubric = typeof courseRubrics.$inferInsert;
