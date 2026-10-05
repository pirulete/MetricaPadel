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

/**
 * POST /api/academies (v0.9) — guardSuperAdmin. ownerId opcional: default =
 * session.user.id; permite al SUPER_ADMIN asignar OWNER a otro miembro.
 */
export const academyCreateWithOwnerSchema = academyCreateSchema.extend({
  ownerId: z.string().uuid("ownerId debe ser un uuid válido").optional(),
});

/**
 * POST /api/academy-requests (v0.9) — discriminated union por type.
 * join_academy: unirse a academia existente (rol ADMIN/COACH).
 * create_academy: pedir que SUPER_ADMIN cree una academia (rol OWNER implícito).
 */
export const academyRequestCreateSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("join_academy"),
    academyId: z.string().uuid("academyId debe ser un uuid válido"),
    requestedRole: z.enum(["ADMIN", "COACH"]),
  }),
  z.object({
    type: z.literal("create_academy"),
    name: z.string().trim().min(1, "name es requerido").max(200, "name no puede superar 200 caracteres"),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(academySlugRegex, "slug debe tener formato a-z0-9- (3-50 caracteres)"),
    primaryColor: z.string().regex(hexColorRegex, "primaryColor debe ser HEX #RRGGBB").optional(),
    requestedRole: z.literal("OWNER").optional(),
  }),
]);

/** GET /api/academy-requests — filtros opcionales status/type (guardSuperAdmin). */
export const academyRequestQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  type: z.enum(["join_academy", "create_academy"]).optional(),
});

/** PUT /api/academies/[id]/members/[userId] — asigna rol a miembro activo. */
export const roleAssignSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "COACH"]),
});

/** POST /api/academies/[id]/transfer-ownership — targetUserId del nuevo OWNER. */
export const transferOwnershipSchema = z.object({
  targetUserId: z.string().uuid("targetUserId debe ser un uuid válido"),
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
export type AcademyCreateWithOwnerInput = z.infer<typeof academyCreateWithOwnerSchema>;
export type AcademyUpdateInput = z.infer<typeof academyUpdateSchema>;
export type MemberInviteInput = z.infer<typeof memberInviteSchema>;
export type AcademyRequestCreateInput = z.infer<typeof academyRequestCreateSchema>;
export type AcademyRequestQueryInput = z.infer<typeof academyRequestQuerySchema>;
export type RoleAssignInput = z.infer<typeof roleAssignSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;