import { z } from "zod";
import { emailSchema } from "@/lib/auth/schemas";

export const userAdminUpdateSchema = z.object({
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  phone: z.string().min(7, "El teléfono es requerido"),
  role: z.enum(["USER", "ADMIN"]),
  status: z.enum(["ACTIVE", "TEMPORARY", "LOCKED"]),
  failedAttempts: z.coerce.number().int().min(0).default(0),
});

export const adminCreateUserSchema = z.object({
  email: emailSchema,
  firstName: z.string().min(1, "El nombre es requerido"),
  lastName: z.string().min(1, "El apellido es requerido"),
  phone: z.string().min(7, "El teléfono es requerido"),
  role: z.enum(["USER", "ADMIN"]).default("USER"),
  status: z.enum(["ACTIVE", "TEMPORARY"]).default("ACTIVE"),
});

export type UserAdminUpdateInput = z.infer<typeof userAdminUpdateSchema>;
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;
