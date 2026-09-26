import { z } from "zod";
import { rubricCreateSchema } from "./padel";

/** Slug de academia: minúsculas, dígitos y guiones, 3-50 chars. */
export const academySlugRegex = /^[a-z0-9-]{3,50}$/;

/** Color primario institucional: HEX #RRGGBB. */
export const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

/** POST /api/academies — crea academia (ownerId lo resuelve el handler). */
export const academyCreateSchema = z.object({
  name: z.string().trim().min(1, "name es requerido").max(200, "name no puede superar 200 caracteres"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(academySlugRegex, "slug debe tener formato a-z0-9- (3-50 caracteres)"),
  primaryColor: z
    .string()
    .regex(hexColorRegex, "primaryColor debe ser HEX #RRGGBB")
    .optional(),
});

/** PUT /api/academies/[id] — partial de create (al menos un campo). */
export const academyUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name es requerido").max(200, "name no puede superar 200 caracteres").optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(academySlugRegex, "slug debe tener formato a-z0-9- (3-50 caracteres)")
      .optional(),
    primaryColor: z.string().regex(hexColorRegex, "primaryColor debe ser HEX #RRGGBB").optional(),
  })
  .refine((v) => v.name !== undefined || v.slug !== undefined || v.primaryColor !== undefined, {
    message: "Debe enviar al menos un campo para actualizar",
  });

/** POST /api/academies/[id]/members/invite — email del profesor a invitar. */
export const memberInviteSchema = z.object({
  email: z.string().trim().email("email inválido").max(255, "email no puede superar 255 caracteres"),
});

/**
 * POST /api/academies/[id]/rubrics — reutiliza rubricCreateSchema de padel.ts.
 * El handler fuerza scope=institutional y academyId=ruta.
 */
export const academyRubricCreateSchema = rubricCreateSchema;

export type AcademyCreateInput = z.infer<typeof academyCreateSchema>;
export type AcademyUpdateInput = z.infer<typeof academyUpdateSchema>;
export type MemberInviteInput = z.infer<typeof memberInviteSchema>;