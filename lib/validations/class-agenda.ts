/**
 * Schemas Zod de la agenda de clases por curso (v0.11).
 * Fecha = `YYYY-MM-DD` wall-clock sin TZ; hora = `HH:mm` (D3).
 * Regla de updates: `.partial()` + `.refine(≥1 campo)` SIEMPRE como último eslabón (A6).
 */
import { z } from "zod";

import { daysBetween, isValidDateStr, isValidTime } from "@/lib/padel/class-agenda";

/** Días de la semana ISO 1–7 (lun=1 … dom=7, D4). */
const dayOfWeekSchema = z.number().int().min(1).max(7);
const timeSchema = z
  .string()
  .refine(isValidTime, { message: "hora inválida (HH:mm 24h)" });
const dateSchema = z
  .string()
  .refine(isValidDateStr, { message: "fecha inválida (YYYY-MM-DD)" });
const durationSchema = z.number().int().min(15).max(180);
const blockStatusValues = ["scheduled", "completed", "cancelled"] as const;

export const MAX_RANGE_DAYS = 56; // 8 semanas
const CURSOR_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const atLeastOneField = (value: object) =>
  Object.keys(value).length > 0;

/** A2 — POST /api/courses/[id]/agenda/slots */
export const weeklySlotInputSchema = z.object({
  dayOfWeek: dayOfWeekSchema,
  startTime: timeSchema,
  durationMinutes: durationSchema,
  label: z.string().trim().max(100).nullable().optional(),
  isActive: z.boolean().optional(),
});

/** A3 — PUT /api/courses/[id]/agenda/slots/[slotId] (al menos 1 campo) */
export const weeklySlotUpdateSchema = weeklySlotInputSchema
  .partial()
  .refine(atLeastOneField, { message: "debe enviar al menos un campo" });

/** A5 — POST /api/courses/[id]/agenda/weeks (weekStart default = lunes actual en el handler) */
export const materializeWeekSchema = z.object({
  weekStart: dateSchema.optional(),
});

/** A6 — GET /api/courses/[id]/agenda/blocks?from=&to= (rango ≤8 semanas) */
export const blockRangeQuerySchema = z
  .object({
    from: dateSchema.optional(),
    to: dateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from no puede ser posterior a to",
  })
  .refine(
    (value) =>
      !value.from || !value.to || daysBetween(value.from, value.to) <= MAX_RANGE_DAYS,
    { message: `el rango máximo es de ${MAX_RANGE_DAYS} días (8 semanas)` },
  );

/** A7 — POST /api/courses/[id]/agenda/blocks */
export const blockCreateSchema = z.object({
  blockDate: dateSchema,
  startTime: timeSchema,
  durationMinutes: durationSchema,
  label: z.string().trim().max(100).nullable().optional(),
  maxCapacity: z.number().int().min(1).nullable().optional(),
  weeklySlotId: z.string().uuid().nullable().optional(),
});

/** A8 — PUT /api/courses/[id]/agenda/blocks/[blockId] (al menos 1 campo) */
const blockUpdateFieldsSchema = blockCreateSchema.extend({
  status: z.enum(blockStatusValues),
});

export const blockUpdateSchema = blockUpdateFieldsSchema
  .partial()
  .refine(atLeastOneField, { message: "debe enviar al menos un campo" });

/** A10 — POST .../blocks/[blockId]/enrollments (all-or-nothing, 1..50) */
export const blockEnrollmentCreateSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1).max(50),
});

/** A11 — PUT .../enrollments/[studentId] (asistencia tri-estado) */
export const blockEnrollmentUpdateSchema = z.object({
  attended: z.boolean().nullable(),
  notes: z.string().trim().max(500).nullable().optional(),
});

/** U1 — GET /api/student/agenda (limit default 5, sin resolveLimit: A5) */
export const studentAgendaQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

/** U2 — GET /api/student/agenda/history (cursor propio `YYYY-MM-DDTHH:mm`, B2) */
export const agendaHistoryQuerySchema = z.object({
  courseId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z
    .string()
    .regex(CURSOR_RE, 'cursor debe ser "YYYY-MM-DDTHH:mm"')
    .superRefine((value, ctx) => {
      const [date, time] = value.split("T") as [string, string];
      if (!isValidDateStr(date) || !isValidTime(time)) {
        ctx.addIssue({ code: "custom", message: "cursor inválido" });
      }
    })
    .optional(),
});
