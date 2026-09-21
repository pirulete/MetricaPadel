import { z } from "zod";

export const rubricCategoryValues = ["tecnica", "tactica", "fisica", "actitud"] as const;
export const rubricStatusValues = ["draft", "active", "archived"] as const;
export const evaluationStatusValues = ["draft", "published"] as const;

/** Params de ruta [id] (uuid) para rúbricas y evaluaciones. */
export const padelIdParamsSchema = z.object({
  id: z.string().uuid("id debe ser un uuid válido"),
});

/** POST /api/admin/users — crea jugador (USER, status=ACTIVE). */
export const adminCreateUserSchema = z.object({
  email: z.string().trim().email("email inválido").max(255),
  firstName: z.string().trim().min(1, "firstName es requerido").max(255),
  lastName: z.string().trim().min(1, "lastName es requerido").max(255),
  password: z.string().min(8, "password debe tener mínimo 8 caracteres").max(255),
});

/** GET /api/admin/users — query de búsqueda opcional. */
export const adminUserQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
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

/** PUT /api/rubrics/[id] — partial de create (reemplazo completo de criteria si viene). */
export const rubricUpdateSchema = rubricCreateSchema.partial();

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

export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
export type RubricCreateInput = z.infer<typeof rubricCreateSchema>;
export type RubricUpdateInput = z.infer<typeof rubricUpdateSchema>;
export type EvaluationCreateInput = z.infer<typeof evaluationCreateSchema>;
export type EvaluationSaveInput = z.infer<typeof evaluationSaveSchema>;