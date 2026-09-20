import { z } from "zod"

// Validación de email
export const emailSchema = z.string().trim().email("Email inválido").toLowerCase()

// Validación de contraseña (mínimo 8 caracteres, debe incluir mayúscula, minúscula y número)
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .regex(/[A-Z]/, "La contraseña debe contener al menos una mayúscula")
  .regex(/[a-z]/, "La contraseña debe contener al menos una minúscula")
  .regex(/[0-9]/, "La contraseña debe contener al menos un número")

// Validación de nombre (solo letras y espacios, 2-50 caracteres)
const nameSchema = z
  .string()
  .min(2, "El nombre debe tener al menos 2 caracteres")
  .max(50, "El nombre no puede exceder 50 caracteres")
  .regex(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/, "El nombre solo puede contener letras")

// Schema para registro
export const registerSchema = z.object({
  email: emailSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
})

export type RegisterInput = z.infer<typeof registerSchema>

// Schema para verificación de email
export const verifyEmailSchema = z.object({
  email: emailSchema,
  code: z.string().length(6, "El código debe tener 6 caracteres").regex(/^\d+$/, "El código debe ser numérico"),
})

export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>

// Schema para login
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es requerida"),
})

export type LoginInput = z.infer<typeof loginSchema>

// Schema para resetear contraseña
export const resetPasswordSchema = z.object({
  email: emailSchema,
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

// Schema para actualizar contraseña con token
export const updatePasswordSchema = z.object({
  token: z.string(),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Las contraseñas no coinciden",
  path: ["confirmPassword"],
})

export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>

// Schema para actualizar perfil (excluyendo email)
export const updateProfileSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  phone: z.string().min(7, "Teléfono inválido").optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
