import { pgTable, text, timestamp, uuid, varchar, json, jsonb, integer, numeric, boolean, date, pgEnum, index, uniqueIndex } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const userRoleEnum = pgEnum('user_role', ['USER', 'ADMIN', 'SUPER_ADMIN']);

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
  tournaments: many(tournaments),
  tournamentRuns: many(tournamentRuns, { relationName: "requestedRuns" }),
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
  'reglas', 'tecnica_basica', 'tecnica_especifica', 'tactica', 'fisica', 'actitud_equipo',
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

export const academyMembershipRoleEnum = pgEnum('academy_membership_role', [
  'OWNER', 'ADMIN', 'COACH',
]);

export const academyStatusEnum = pgEnum('academy_status', [
  'active', 'archived',
]);

export const rubricScopeEnum = pgEnum('rubric_scope', [
  'personal', 'institutional',
]);

export const academyRequestTypeEnum = pgEnum('academy_request_type', ['join_academy', 'create_academy']);

export const academyRequestStatusEnum = pgEnum('academy_request_status', ['pending', 'approved', 'rejected']);

export const classBlockStatusEnum = pgEnum('class_block_status', ['scheduled', 'completed', 'cancelled']);
export const blockEnrollmentStatusEnum = pgEnum('block_enrollment_status', ['scheduled', 'completed', 'cancelled']);

export type CourseLevel = (typeof courseLevelEnum.enumValues)[number];
export type CourseStatus = (typeof courseStatusEnum.enumValues)[number];
export type AcademyMembershipRole = (typeof academyMembershipRoleEnum.enumValues)[number];
export type AcademyStatus = (typeof academyStatusEnum.enumValues)[number];
export type RubricScope = (typeof rubricScopeEnum.enumValues)[number];
export type AcademyRequestType = (typeof academyRequestTypeEnum.enumValues)[number];
export type AcademyRequestStatus = (typeof academyRequestStatusEnum.enumValues)[number];
export type ClassBlockStatus = (typeof classBlockStatusEnum.enumValues)[number];
export type BlockEnrollmentStatus = (typeof blockEnrollmentStatusEnum.enumValues)[number];

// Rúbrica del coach (ADMIN). ownerId = coach. Archivar = soft (status=archived),
// nunca hard delete: las evaluaciones referencian la rúbrica.
export const rubrics = pgTable("rubrics", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }),
  title: varchar("title", { length: 200 }).notNull(),
  category: rubricCategoryEnum("category").notNull(),
  scope: rubricScopeEnum("scope").notNull().default('personal'),
  status: rubricStatusEnum("status").notNull().default('draft'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("rubrics_owner_idx").on(table.ownerId),
  index("rubrics_academy_idx").on(table.academyId),
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
// version (G6): solo publicadas tienen versión 1..N por (studentId, rubricId);
// drafts quedan null. El cómputo vive en publishEvaluation (COALESCE(MAX,0)+1).
export const evaluations = pgTable("evaluations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "no action" }),
  teacherId: uuid("teacher_id").notNull().references(() => users.id, { onDelete: "no action" }),
  rubricId: uuid("rubric_id").notNull().references(() => rubrics.id, { onDelete: "no action" }),
  courseId: uuid("course_id").references(() => courses.id, { onDelete: "set null" }),
  status: evaluationStatusEnum("status").notNull().default('draft'),
  version: integer("version"),
  totalScore: integer("total_score"),
  maxScore: integer("max_score"),
  globalComment: text("global_comment"),
  publishedAt: timestamp("published_at"),
  readAt: timestamp("read_at"),
  // G16: soft-delete (archivado). Las evaluaciones archivadas se ocultan de
  // todas las queries de coach/alumno pero se conservan (historial + versiones).
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("evaluations_student_idx").on(table.studentId),
  index("evaluations_teacher_idx").on(table.teacherId),
  index("evaluations_rubric_idx").on(table.rubricId),
  index("evaluations_student_rubric_status_idx").on(table.studentId, table.rubricId, table.status),
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

// Academia: entidad multi-tenant que agrupa profesores, rúbricas institucionales y branding.
// ownerId = usuario que crea la academia (se inserta como OWNER en academy_memberships).
export const academies = pgTable("academies", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  name: varchar("name", { length: 200 }).notNull(),
  slug: varchar("slug", { length: 50 }).notNull().unique(),
  logoUrl: varchar("logo_url", { length: 5000 }),
  primaryColor: varchar("primary_color", { length: 7 }).notNull().default('#3b82f6'),
  status: academyStatusEnum("status").notNull().default('active'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("academies_owner_idx").on(table.ownerId),
]);

// Membresía de usuario en academia. UNIQUE (academyId, userId) permite multi-academia.
// Rol por academia: OWNER/ADMIN/COACH. user_role global (USER/ADMIN) intacto.
export const academyMemberships = pgTable("academy_memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  academyId: uuid("academy_id").notNull().references(() => academies.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  role: academyMembershipRoleEnum("role").notNull().default('COACH'),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "no action" }),
  status: varchar("status", { length: 20 }).notNull().default('active'),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("academy_memberships_academy_user_idx").on(table.academyId, table.userId),
  index("academy_memberships_academy_idx").on(table.academyId),
  index("academy_memberships_user_idx").on(table.userId),
]);

// Solicitud de acceso a academia (v0.9): join_academy (unirse a academia
// existente) o create_academy (que SUPER_ADMIN cree una academia para el
// solicitante). Los índices parciales UNIQUE son la fuente del 409: un mismo
// usuario no puede tener 2 solicitudes pendientes del mismo tipo (Postgres
// trata NULLs como distintos, por eso create_academy usa su propio índice).
export const academyAccessRequests = pgTable("academy_access_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "no action" }),
  type: academyRequestTypeEnum("type").notNull(),
  academyId: uuid("academy_id").references(() => academies.id, { onDelete: "set null" }), // join_academy; null en create_academy
  requestedRole: academyMembershipRoleEnum("requested_role").notNull().default('COACH'),
  payload: jsonb("payload").notNull().default({}), // create_academy: {name, slug, primaryColor?}
  status: academyRequestStatusEnum("status").notNull().default('pending'),
  reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "no action" }),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("academy_requests_user_idx").on(table.userId),
  index("academy_requests_status_idx").on(table.status),
  index("academy_requests_academy_idx").on(table.academyId),
  // Duplicado pendiente join: mismo usuario + type + academia → 409
  uniqueIndex("academy_requests_pending_join_idx")
    .on(table.userId, table.type, table.academyId)
    .where(sql`${table.status} = 'pending' AND ${table.type} = 'join_academy'`),
  // Duplicado pendiente create: mismo usuario + type (academyId null) → 409
  uniqueIndex("academy_requests_pending_create_idx")
    .on(table.userId, table.type)
    .where(sql`${table.status} = 'pending' AND ${table.type} = 'create_academy'`),
]);

// Transición (escenario táctico) del coach (ADMIN). ownerId = coach, sin cascade
// (coherente con rubrics/courses). scenario JSONB guarda sólo { initialStepIndex, steps };
// sin $type<> (schema.ts no importa dominio). Hard delete: audit_logs conserva el rastro.
export const coachTransitions = pgTable("coach_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  title: varchar("title", { length: 200 }).notNull(),
  scenario: jsonb("scenario").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("coach_transitions_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);

// Agenda de clases — capa 1: plantilla semanal recurrente del curso.
// dayOfWeek = ISO 1–7 (lun=1 … dom=7). startTime = 'HH:mm' wall-clock sin TZ.
export const weeklySlots = pgTable("weekly_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  label: varchar("label", { length: 100 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("weekly_slots_course_day_time_idx").on(table.courseId, table.dayOfWeek, table.startTime),
  index("weekly_slots_course_active_idx").on(table.courseId, table.isActive),
]);

// Agenda de clases — capa 2: instancia datada de un slot (o bloque suelto).
// blockDate = date wall-clock ('YYYY-MM-DD'); weeklySlotId null = bloque suelto.
// Idempotencia D7: UNIQUE parcial (weeklySlotId, blockDate) WHERE weeklySlotId IS NOT NULL.
export const classBlocks = pgTable("class_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  courseId: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
  weeklySlotId: uuid("weekly_slot_id").references(() => weeklySlots.id, { onDelete: "set null" }),
  blockDate: date("block_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  durationMinutes: integer("duration_minutes").notNull(),
  status: classBlockStatusEnum("status").notNull().default('scheduled'),
  maxCapacity: integer("max_capacity"),
  label: varchar("label", { length: 100 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("class_blocks_slot_date_idx")
    .on(table.weeklySlotId, table.blockDate)
    .where(sql`"weekly_slot_id" is not null`),
  index("class_blocks_course_date_idx").on(table.courseId, table.blockDate),
  index("class_blocks_date_status_idx").on(table.blockDate, table.status),
]);

// Agenda de clases — asignación de alumno a bloque + asistencia tri-estado.
// studentId sin cascade: historial protegido (D8). Sin block_date/student_id
// denormalizados (D17): el filtro por fecha se resuelve por join a class_blocks.
export const blockEnrollments = pgTable("block_enrollments", {
  id: uuid("id").primaryKey().defaultRandom(),
  blockId: uuid("block_id").notNull().references(() => classBlocks.id, { onDelete: "cascade" }),
  studentId: uuid("student_id").notNull().references(() => users.id, { onDelete: "no action" }),
  status: blockEnrollmentStatusEnum("status").notNull().default('scheduled'),
  attended: boolean("attended"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  uniqueIndex("block_enrollments_block_student_idx").on(table.blockId, table.studentId),
  index("block_enrollments_student_status_idx").on(table.studentId, table.status),
  index("block_enrollments_student_attended_idx").on(table.studentId, table.attended),
]);

export const rubricsRelations = relations(rubrics, ({ one, many }) => ({
  owner: one(users, {
    fields: [rubrics.ownerId],
    references: [users.id],
  }),
  academy: one(academies, {
    fields: [rubrics.academyId],
    references: [academies.id],
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

export const academiesRelations = relations(academies, ({ one, many }) => ({
  owner: one(users, {
    fields: [academies.ownerId],
    references: [users.id],
  }),
  members: many(academyMemberships),
  rubrics: many(rubrics),
}));

export const academyMembershipsRelations = relations(academyMemberships, ({ one }) => ({
  academy: one(academies, {
    fields: [academyMemberships.academyId],
    references: [academies.id],
  }),
  user: one(users, {
    fields: [academyMemberships.userId],
    references: [users.id],
  }),
  invitedByUser: one(users, {
    relationName: "invitedBy",
    fields: [academyMemberships.invitedBy],
    references: [users.id],
  }),
}));

export const academyAccessRequestsRelations = relations(academyAccessRequests, ({ one }) => ({
  user: one(users, {
    fields: [academyAccessRequests.userId],
    references: [users.id],
  }),
  academy: one(academies, {
    fields: [academyAccessRequests.academyId],
    references: [academies.id],
  }),
  reviewer: one(users, {
    relationName: "reviewedBy",
    fields: [academyAccessRequests.reviewedBy],
    references: [users.id],
  }),
}));

export const coachTransitionsRelations = relations(coachTransitions, ({ one }) => ({
  owner: one(users, {
    fields: [coachTransitions.ownerId],
    references: [users.id],
  }),
}));

export const weeklySlotsRelations = relations(weeklySlots, ({ one, many }) => ({
  course: one(courses, {
    fields: [weeklySlots.courseId],
    references: [courses.id],
  }),
  blocks: many(classBlocks),
}));

export const classBlocksRelations = relations(classBlocks, ({ one, many }) => ({
  course: one(courses, {
    fields: [classBlocks.courseId],
    references: [courses.id],
  }),
  weeklySlot: one(weeklySlots, {
    fields: [classBlocks.weeklySlotId],
    references: [weeklySlots.id],
  }),
  enrollments: many(blockEnrollments),
}));

export const blockEnrollmentsRelations = relations(blockEnrollments, ({ one }) => ({
  block: one(classBlocks, {
    fields: [blockEnrollments.blockId],
    references: [classBlocks.id],
  }),
  student: one(users, {
    fields: [blockEnrollments.studentId],
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
export type Academy = typeof academies.$inferSelect;
export type NewAcademy = typeof academies.$inferInsert;
export type AcademyMembership = typeof academyMemberships.$inferSelect;
export type NewAcademyMembership = typeof academyMemberships.$inferInsert;
export type AcademyAccessRequest = typeof academyAccessRequests.$inferSelect;
export type NewAcademyAccessRequest = typeof academyAccessRequests.$inferInsert;
export type CoachTransition = typeof coachTransitions.$inferSelect;
export type NewCoachTransition = typeof coachTransitions.$inferInsert;
export type WeeklySlot = typeof weeklySlots.$inferSelect;
export type NewWeeklySlot = typeof weeklySlots.$inferInsert;
export type ClassBlock = typeof classBlocks.$inferSelect;
export type NewClassBlock = typeof classBlocks.$inferInsert;
export type BlockEnrollment = typeof blockEnrollments.$inferSelect;
export type NewBlockEnrollment = typeof blockEnrollments.$inferInsert;

// ---------------------------------------------------------------------------
// Padel Evaluativo — Torneos: motor de agenda (v0.12 — motor-torneo-ts)
// Módulo de DB independiente (D2): CERO FK a courses/academies. Solo 2 FK
// entrantes a users (ownerId/requestedBy, "no action").
// ---------------------------------------------------------------------------

export const tournamentStatusEnum = pgEnum('tournament_status', [
  'draft', 'agenda_draft', 'archived',
]);

export const tournamentPhaseEnum = pgEnum('tournament_phase', [
  'previa', 'final',
]);

// engineStatus NO es enum: es varchar(32) para no acoplar la DB a la
// nomenclatura del solver (optimal | feasible_time_limit | infeasible | ...).
export const tournamentRunStatusEnum = pgEnum('tournament_run_status', [
  'queued', 'running', 'succeeded', 'infeasible', 'failed', 'invalid',
]);

export const tournamentMatchRoundEnum = pgEnum('tournament_match_round', [
  'grupo', '16vos', '8vos', '4tos', 'semi', 'final',
]);

export type TournamentStatus = (typeof tournamentStatusEnum.enumValues)[number];
export type TournamentPhase = (typeof tournamentPhaseEnum.enumValues)[number];
export type TournamentRunStatus = (typeof tournamentRunStatusEnum.enumValues)[number];
export type TournamentMatchRound = (typeof tournamentMatchRoundEnum.enumValues)[number];

// Torneo importado por el coach. Archivar = soft (status=archived): la
// instancia y los slots históricos siguen consultables. No hay DELETE en M1.
// params: { fronteraSabado, descansoFinal, maxSeguidos, bloqueFinalObjetivo,
//           dobleDuraEn, W_* } — ver technical-design §4.2.
export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  name: varchar("name", { length: 200 }).notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  status: tournamentStatusEnum("status").notNull().default('draft'),
  blockMinutes: integer("block_minutes").notNull().default(75),
  courts: integer("courts").notNull().default(8),
  params: jsonb("params").notNull().default({}),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("tournaments_owner_updated_idx").on(table.ownerId, table.updatedAt),
  index("tournaments_owner_status_idx").on(table.ownerId, table.status),
]);

// Bloque de calendario materializado: idx 0..N-1 aritado por calendar.ts.
// dayLabel ('Jue') + startTime ('HH:mm') son strings: el motor nunca usa Date.
export const tournamentBlocks = pgTable("tournament_blocks", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  idx: integer("idx").notNull(),
  dayLabel: varchar("day_label", { length: 3 }).notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  phase: tournamentPhaseEnum("phase").notNull(),
  isExtension: boolean("is_extension").notNull().default(false),
  capacity: integer("capacity").notNull(),
}, (table) => [
  uniqueIndex("tournament_blocks_tournament_idx_uq").on(table.tournamentId, table.idx),
]);

// Categoría (1ra/2da/3ra...). sortOrder materializado: P-3 exige orden
// determinista (nunca Object.keys) para que el cuadro y los codes coincidan.
export const tournamentCategories = pgTable("tournament_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  sex: varchar("sex", { length: 1 }).notNull(),
  level: integer("level"),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  uniqueIndex("tournament_categories_tournament_code_uq").on(table.tournamentId, table.code),
  index("tournament_categories_tournament_sort_idx").on(table.tournamentId, table.sortOrder),
]);

// Grupo de previa dentro de una categoría. size ∈ {3,4} (R5 del loader).
export const tournamentGroups = pgTable("tournament_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 10 }).notNull(),
  size: integer("size").notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  uniqueIndex("tournament_groups_category_code_uq").on(table.categoryId, table.code),
  index("tournament_groups_tournament_idx").on(table.tournamentId),
]);

// Persona por documento. Una persona puede jugar en >1 pareja solo si las
// categorías son distintas (R2 del loader).
export const tournamentPersons = pgTable("tournament_persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  documentId: varchar("document_id", { length: 50 }).notNull(),
  sex: varchar("sex", { length: 1 }),
  displayName: varchar("display_name", { length: 200 }),
}, (table) => [
  uniqueIndex("tournament_persons_tournament_document_uq").on(table.tournamentId, table.documentId),
]);

// Pareja (team) inscrita en 1 grupo de 1 categoría (R1 del loader).
export const tournamentTeams = pgTable("tournament_teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  groupId: uuid("group_id").notNull().references(() => tournamentGroups.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 20 }).notNull(),
  sortOrder: integer("sort_order").notNull(),
}, (table) => [
  uniqueIndex("tournament_teams_tournament_code_uq").on(table.tournamentId, table.code),
  index("tournament_teams_group_idx").on(table.groupId),
  index("tournament_teams_tournament_idx").on(table.tournamentId),
]);

// Miembros de la pareja. idx (personId) sirve el lookup de "doble categoría".
export const tournamentTeamMembers = pgTable("tournament_team_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => tournamentTeams.id, { onDelete: "cascade" }),
  personId: uuid("person_id").notNull().references(() => tournamentPersons.id, { onDelete: "cascade" }),
}, (table) => [
  uniqueIndex("tournament_team_members_team_person_uq").on(table.teamId, table.personId),
  index("tournament_team_members_person_idx").on(table.personId),
]);

// no_disponible temporal: bloque de previa en el que la pareja no puede jugar.
export const tournamentTeamAvailability = pgTable("tournament_team_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id").notNull().references(() => tournamentTeams.id, { onDelete: "cascade" }),
  blockIdx: integer("block_idx").notNull(),
}, (table) => [
  uniqueIndex("tournament_team_availability_team_block_uq").on(table.teamId, table.blockIdx),
]);

// Partido materializado en la transacción de import (Q2). sourceGroups/feeders
// guardan CÓDIGOS (["3ra-G1"], ["3ra-8vos-1"]), no UUIDs: legibles en SQL.
export const tournamentMatches = pgTable("tournament_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  categoryId: uuid("category_id").notNull().references(() => tournamentCategories.id, { onDelete: "cascade" }),
  phase: tournamentPhaseEnum("phase").notNull(),
  round: tournamentMatchRoundEnum("round").notNull(),
  groupId: uuid("group_id").references(() => tournamentGroups.id, { onDelete: "set null" }),
  teamAId: uuid("team_a_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  teamBId: uuid("team_b_id").references(() => tournamentTeams.id, { onDelete: "set null" }),
  sourceGroups: jsonb("source_groups").notNull().default([]),
  feeders: jsonb("feeders").notNull().default([]),
  code: varchar("code", { length: 60 }).notNull(),
}, (table) => [
  uniqueIndex("tournament_matches_tournament_code_uq").on(table.tournamentId, table.code),
  index("tournament_matches_tournament_phase_idx").on(table.tournamentId, table.phase),
  index("tournament_matches_category_idx").on(table.categoryId),
]);

// Corrida del motor (job). params = snapshot completo + timeLimitMs + mipRelGap
// ⇒ un run es reproducible sin releer el torneo.
// UNIQUE parcial: garantía DB del 409 (solo 1 run activo por torneo).
export const tournamentRuns = pgTable("tournament_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull().references(() => tournaments.id, { onDelete: "cascade" }),
  requestedBy: uuid("requested_by").notNull().references(() => users.id, { onDelete: "no action" }),
  status: tournamentRunStatusEnum("status").notNull().default('queued'),
  params: jsonb("params").notNull(),
  engineStatus: varchar("engine_status", { length: 32 }),
  objective: numeric("objective"),
  mipGap: numeric("mip_gap"),
  timeMs: integer("time_ms"),
  diagnostics: jsonb("diagnostics"),
  error: jsonb("error"),
  slotsCount: integer("slots_count").notNull().default(0),
  dispatchAttempts: integer("dispatch_attempts").notNull().default(0),
  lastDispatchAt: timestamp("last_dispatch_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  startedAt: timestamp("started_at"),
  finishedAt: timestamp("finished_at"),
}, (table) => [
  uniqueIndex("tournament_runs_active_uq")
    .on(table.tournamentId)
    .where(sql`status in ('queued', 'running')`),
  index("tournament_runs_tournament_created_idx").on(table.tournamentId, table.createdAt),
  index("tournament_runs_tournament_status_idx").on(table.tournamentId, table.status),
]);

// Asignación final (match → bloque + cancha) de un run. Se escriben en la misma
// transacción que el estado terminal: nunca agenda parcial.
export const tournamentAgendaSlots = pgTable("tournament_agenda_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => tournamentRuns.id, { onDelete: "cascade" }),
  matchId: uuid("match_id").notNull().references(() => tournamentMatches.id, { onDelete: "cascade" }),
  blockIdx: integer("block_idx").notNull(),
  court: integer("court").notNull(),
}, (table) => [
  uniqueIndex("tournament_agenda_slots_run_match_uq").on(table.runId, table.matchId),
  uniqueIndex("tournament_agenda_slots_run_block_court_uq").on(table.runId, table.blockIdx, table.court),
  index("tournament_agenda_slots_run_block_idx").on(table.runId, table.blockIdx),
]);

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  owner: one(users, {
    fields: [tournaments.ownerId],
    references: [users.id],
  }),
  blocks: many(tournamentBlocks),
  categories: many(tournamentCategories),
  groups: many(tournamentGroups),
  persons: many(tournamentPersons),
  teams: many(tournamentTeams),
  matches: many(tournamentMatches),
  runs: many(tournamentRuns),
}));

export const tournamentBlocksRelations = relations(tournamentBlocks, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentBlocks.tournamentId],
    references: [tournaments.id],
  }),
}));

export const tournamentCategoriesRelations = relations(tournamentCategories, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentCategories.tournamentId],
    references: [tournaments.id],
  }),
  groups: many(tournamentGroups),
  teams: many(tournamentTeams),
  matches: many(tournamentMatches),
}));

export const tournamentGroupsRelations = relations(tournamentGroups, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentGroups.tournamentId],
    references: [tournaments.id],
  }),
  category: one(tournamentCategories, {
    fields: [tournamentGroups.categoryId],
    references: [tournamentCategories.id],
  }),
  teams: many(tournamentTeams),
  matches: many(tournamentMatches),
}));

export const tournamentPersonsRelations = relations(tournamentPersons, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentPersons.tournamentId],
    references: [tournaments.id],
  }),
  teamMemberships: many(tournamentTeamMembers),
}));

export const tournamentTeamsRelations = relations(tournamentTeams, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentTeams.tournamentId],
    references: [tournaments.id],
  }),
  category: one(tournamentCategories, {
    fields: [tournamentTeams.categoryId],
    references: [tournamentCategories.id],
  }),
  group: one(tournamentGroups, {
    fields: [tournamentTeams.groupId],
    references: [tournamentGroups.id],
  }),
  members: many(tournamentTeamMembers),
  availability: many(tournamentTeamAvailability),
}));

export const tournamentTeamMembersRelations = relations(tournamentTeamMembers, ({ one }) => ({
  team: one(tournamentTeams, {
    fields: [tournamentTeamMembers.teamId],
    references: [tournamentTeams.id],
  }),
  person: one(tournamentPersons, {
    fields: [tournamentTeamMembers.personId],
    references: [tournamentPersons.id],
  }),
}));

export const tournamentTeamAvailabilityRelations = relations(tournamentTeamAvailability, ({ one }) => ({
  team: one(tournamentTeams, {
    fields: [tournamentTeamAvailability.teamId],
    references: [tournamentTeams.id],
  }),
}));

export const tournamentMatchesRelations = relations(tournamentMatches, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentMatches.tournamentId],
    references: [tournaments.id],
  }),
  category: one(tournamentCategories, {
    fields: [tournamentMatches.categoryId],
    references: [tournamentCategories.id],
  }),
  group: one(tournamentGroups, {
    fields: [tournamentMatches.groupId],
    references: [tournamentGroups.id],
  }),
  teamA: one(tournamentTeams, {
    relationName: "matchTeamA",
    fields: [tournamentMatches.teamAId],
    references: [tournamentTeams.id],
  }),
  teamB: one(tournamentTeams, {
    relationName: "matchTeamB",
    fields: [tournamentMatches.teamBId],
    references: [tournamentTeams.id],
  }),
  slots: many(tournamentAgendaSlots),
}));

export const tournamentRunsRelations = relations(tournamentRuns, ({ one, many }) => ({
  tournament: one(tournaments, {
    fields: [tournamentRuns.tournamentId],
    references: [tournaments.id],
  }),
  requester: one(users, {
    relationName: "requestedRuns",
    fields: [tournamentRuns.requestedBy],
    references: [users.id],
  }),
  slots: many(tournamentAgendaSlots),
}));

export const tournamentAgendaSlotsRelations = relations(tournamentAgendaSlots, ({ one }) => ({
  run: one(tournamentRuns, {
    fields: [tournamentAgendaSlots.runId],
    references: [tournamentRuns.id],
  }),
  match: one(tournamentMatches, {
    fields: [tournamentAgendaSlots.matchId],
    references: [tournamentMatches.id],
  }),
}));

export type Tournament = typeof tournaments.$inferSelect;
export type NewTournament = typeof tournaments.$inferInsert;
export type TournamentBlock = typeof tournamentBlocks.$inferSelect;
export type NewTournamentBlock = typeof tournamentBlocks.$inferInsert;
export type TournamentCategory = typeof tournamentCategories.$inferSelect;
export type NewTournamentCategory = typeof tournamentCategories.$inferInsert;
export type TournamentGroup = typeof tournamentGroups.$inferSelect;
export type NewTournamentGroup = typeof tournamentGroups.$inferInsert;
export type TournamentPerson = typeof tournamentPersons.$inferSelect;
export type NewTournamentPerson = typeof tournamentPersons.$inferInsert;
export type TournamentTeam = typeof tournamentTeams.$inferSelect;
export type NewTournamentTeam = typeof tournamentTeams.$inferInsert;
export type TournamentTeamMember = typeof tournamentTeamMembers.$inferSelect;
export type NewTournamentTeamMember = typeof tournamentTeamMembers.$inferInsert;
export type TournamentTeamAvailability = typeof tournamentTeamAvailability.$inferSelect;
export type NewTournamentTeamAvailability = typeof tournamentTeamAvailability.$inferInsert;
export type TournamentMatch = typeof tournamentMatches.$inferSelect;
export type NewTournamentMatch = typeof tournamentMatches.$inferInsert;
export type TournamentRun = typeof tournamentRuns.$inferSelect;
export type NewTournamentRun = typeof tournamentRuns.$inferInsert;
export type TournamentAgendaSlot = typeof tournamentAgendaSlots.$inferSelect;
export type NewTournamentAgendaSlot = typeof tournamentAgendaSlots.$inferInsert;
