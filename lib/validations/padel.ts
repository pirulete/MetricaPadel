import { z } from "zod";

export const rubricCategoryValues = ["reglas", "tecnica_basica", "tecnica_especifica", "tactica", "fisica", "actitud_equipo"] as const;
export const rubricStatusValues = ["draft", "active", "archived"] as const;
export const evaluationStatusValues = ["draft", "published"] as const;
export const courseLevelValues = ["iniciacion", "intermedio", "avanzado"] as const;
export const courseStatusValues = ["active", "archived"] as const;

/** Params de ruta [id] (uuid) para rúbricas y evaluaciones. */
export const padelIdParamsSchema = z.object({
  id: z.string().uuid("id debe ser un uuid válido"),
});

/** POST /api/admin/users — crea jugador (USER, status=ACTIVE). password opcional (G4): si no viene, el handler genera una. */
export const adminCreateUserSchema = z.object({
  email: z.string().trim().email("email inválido").max(255),
  firstName: z.string().trim().min(1, "firstName es requerido").max(255),
  lastName: z.string().trim().min(1, "lastName es requerido").max(255),
  password: z.string().min(8, "password debe tener mínimo 8 caracteres").max(255).optional(),
});

/** GET /api/admin/users — query de búsqueda opcional. */
export const adminUserQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
});

/** PUT /api/admin/users/[id] — actualiza firstName/lastName/phone (G10). Al menos un campo. */
export const adminUpdateUserSchema = z
  .object({
    firstName: z.string().trim().min(1, "firstName es requerido").max(255).optional(),
    lastName: z.string().trim().min(1, "lastName es requerido").max(255).optional(),
    phone: z.string().trim().max(20, "phone no puede superar 20 caracteres").optional(),
  })
  .refine((v) => v.firstName !== undefined || v.lastName !== undefined || v.phone !== undefined, {
    message: "Debe enviar al menos un campo para actualizar",
  });

/** POST /api/rubrics — crea rúbrica con criteria + 4 descriptores por criterio. */
export const rubricCreateSchema = z.object({
  title: z.string().trim().min(1, "title es requerido").max(200),
  category: z.enum(rubricCategoryValues),
  criteria: z
    .array(
      z.object({
        name: z.string().trim().min(1, "name es requerido").max(200),
        descriptors: z
          .array(z.string().trim().min(1, "descriptor es requerido").max(1000))
          .length(4, "cada criterio requiere exactamente 4 descriptores"),
      })
    )
    .min(1, "mínimo 1 criterio")
    .max(50, "máximo 50 criterios"),
});

/** PUT /api/rubrics/[id] — partial de create + status (reemplazo completo de criteria si viene). */
export const rubricUpdateSchema = rubricCreateSchema.extend({
  status: z.enum(["draft", "active", "archived"]).optional(),
}).partial();

/** POST /api/evaluations — crea borrador (studentId + rubricId). */
export const evaluationCreateSchema = z.object({
  studentId: z.string().uuid("studentId debe ser un uuid válido"),
  rubricId: z.string().uuid("rubricId debe ser un uuid válido"),
});

/** PUT /api/evaluations/[id] — guarda scores + globalComment en borrador. */
export const evaluationSaveSchema = z.object({
  scores: z
    .array(
      z.object({
        criteriaId: z.string().uuid("criteriaId debe ser un uuid válido"),
        levelId: z.string().uuid("levelId debe ser un uuid válido"),
        comment: z.string().trim().max(2000).optional(),
      })
    )
    .min(1, "mínimo 1 score")
    .max(100, "máximo 100 scores"),
  globalComment: z.string().trim().max(5000).optional(),
});

/** GET /api/rubrics — query status (draft|active|archived). */
export const rubricListQuerySchema = z.object({
  status: z.enum(rubricStatusValues).optional(),
});

/** GET /api/evaluations — query status (draft|published). */
export const evaluationListQuerySchema = z.object({
  status: z.enum(evaluationStatusValues).optional(),
});

/** POST /api/courses — crea curso (inviteCode lo genera el handler). */
export const courseCreateSchema = z.object({
  name: z.string().trim().min(1, "name es requerido").max(200),
  level: z.enum(courseLevelValues),
  schedule: z.string().trim().max(100).optional(),
  days: z.array(z.string().trim().min(1).max(10)).max(7).optional(),
});

/** PUT /api/courses/[id] — partial de create. */
export const courseUpdateSchema = courseCreateSchema.partial();

/** POST /api/courses/join — inviteCode normalizado (case-insensitive, D4). */
export const courseJoinSchema = z.object({
  inviteCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => /^PAD-[A-Z0-9]{4}$/.test(v), "inviteCode debe tener formato PAD-XXXX"),
});

/** POST /api/courses/[id]/rubrics — asigna rúbrica activa del coach. */
export const courseRubricAssignSchema = z.object({
  rubricId: z.string().uuid("rubricId debe ser un uuid válido"),
});

/** GET /api/history — filtros opcionales (courseId/studentId/status). */
export const historyQuerySchema = z.object({
  courseId: z.string().uuid("courseId debe ser un uuid válido").optional(),
  studentId: z.string().uuid("studentId debe ser un uuid válido").optional(),
  status: z.enum(evaluationStatusValues).optional(),
});

/** POST /api/courses/[id]/students — agrega alumno por id (G12, coach). */
export const courseStudentAddSchema = z.object({
  studentId: z.string().uuid("studentId debe ser un uuid válido"),
});

/** GET /api/courses/[id]/students/search — query de búsqueda de candidatos (G12). */
export const courseStudentSearchQuerySchema = z.object({
  q: z.string().trim().min(1, "q es requerido").max(100, "q no puede superar 100 caracteres"),
});

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type AdminUpdateUserInput = z.infer<typeof adminUpdateUserSchema>;
export type RubricCreateInput = z.infer<typeof rubricCreateSchema>;
export type RubricUpdateInput = z.infer<typeof rubricUpdateSchema>;
export type EvaluationCreateInput = z.infer<typeof evaluationCreateSchema>;
export type EvaluationSaveInput = z.infer<typeof evaluationSaveSchema>;
export type CourseCreateInput = z.infer<typeof courseCreateSchema>;
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;
export type CourseJoinInput = z.infer<typeof courseJoinSchema>;
export type CourseRubricAssignInput = z.infer<typeof courseRubricAssignSchema>;
export type HistoryQueryInput = z.infer<typeof historyQuerySchema>;
export type CourseStudentAddInput = z.infer<typeof courseStudentAddSchema>;
export type CourseStudentSearchQueryInput = z.infer<typeof courseStudentSearchQuerySchema>;