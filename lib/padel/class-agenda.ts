/**
 * Lógica pura de la agenda de clases por curso (v0.11, change_id 2026-11-04-class-agenda).
 *
 * CLIENT-SAFE (D19): cero imports `node:`, cero `process.env`, cero DB. El timezone
 * lo inyecta el caller (`todayInTimeZone(tz, now)`), no se lee del entorno aquí.
 * Fecha/hora de dominio = wall-clock sin TZ: `block_date` `YYYY-MM-DD` + `start_time` `HH:mm`.
 */

export type BlockStatus = "scheduled" | "completed" | "cancelled";

export type WeekInfo = {
  weekStart: string;
  weekEnd: string;
  dates: string[];
  weekNumber: number;
};

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_LABELS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"] as const;
const MONTH_LABELS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

function dateMs(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getTime();
}

function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO 1..7 (lun=1 … dom=7) de una fecha `YYYY-MM-DD` válida. */
function isoDayOfWeek(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Semana ISO 8601 (1..53) de la fecha; usa el jueves de la semana como referencia. */
function isoWeekNumber(dateStr: string): number {
  const thursday = new Date(`${dateStr}T00:00:00Z`);
  const isoDay = thursday.getUTCDay() || 7;
  thursday.setUTCDate(thursday.getUTCDate() + 4 - isoDay);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** Calendario real: rechaza formatos inválidos y fechas inexistentes (`2026-02-30`). */
export function isValidDateStr(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** `HH:mm` 24h con ceros a la izquierda (`7:00` y `24:00` no son válidos). */
export function isValidTime(value: string): boolean {
  return TIME_RE.test(value);
}

/** Lunes (ISO 1) de la semana de `dateStr`, normalizado a `YYYY-MM-DD`. */
export function mondayOf(dateStr: string): string {
  if (!isValidDateStr(dateStr)) {
    throw new TypeError(`mondayOf: fecha inválida "${dateStr}"`);
  }
  return toIsoDate(dateMs(dateStr) - (isoDayOfWeek(dateStr) - 1) * DAY_MS);
}

/** Suma días a una fecha `YYYY-MM-DD` (aritmética UTC, sin TZ local). */
export function addDays(dateStr: string, days: number): string {
  if (!isValidDateStr(dateStr)) {
    throw new TypeError(`addDays: fecha inválida "${dateStr}"`);
  }
  return toIsoDate(dateMs(dateStr) + days * DAY_MS);
}

/** Días calendario entre dos fechas `YYYY-MM-DD` (`to` − `from`). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateMs(to) - dateMs(from)) / DAY_MS);
}

/** Semana completa (7 fechas lun→dom) que empieza en `weekStartIso` (se normaliza al lunes). */
export function buildWeekInfo(weekStartIso: string): WeekInfo {
  const weekStart = mondayOf(weekStartIso);
  const base = dateMs(weekStart);
  const dates = Array.from({ length: 7 }, (_, index) => toIsoDate(base + index * DAY_MS));
  return {
    weekStart,
    weekEnd: dates[6] as string,
    dates,
    weekNumber: isoWeekNumber(weekStart),
  };
}

/** Suma minutos a `HH:mm` con wrap de 24 h (una clase de 30 min a las 23:45 termina 00:15). */
export function addMinutes(time: string, minutes: number): string {
  if (!isValidTime(time)) {
    throw new TypeError(`addMinutes: hora inválida "${time}"`);
  }
  const [hours, mins] = time.split(":").map(Number) as [number, number];
  const delta = Math.trunc(minutes);
  const total = (((hours * 60 + mins + delta) % 1440) + 1440) % 1440;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export type MaterializationSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  label?: string | null;
  isActive?: boolean;
};

export type MaterializationCandidate = {
  weeklySlotId: string;
  blockDate: string;
  startTime: string;
  durationMinutes: number;
  label: string | null;
};

export type MaterializationPlan = {
  candidates: MaterializationCandidate[];
  skippedExisting: number;
  skippedInactive: number;
};

/**
 * Plan de materialización de una semana desde la plantilla de slots.
 * Idempotente por construcción (D7): `existingKeys` = `${weeklySlotId}:${blockDate}` ya
 * presentes; los repetidos se cuentan en `skippedExisting` y no se emiten.
 * `skippedInactive` incluye slots inactivos y `dayOfWeek` fuera de 1..7.
 */
export function buildMaterializationPlan(
  slots: MaterializationSlot[],
  weekStart: string,
  existingKeys: string[] = [],
): MaterializationPlan {
  const { dates } = buildWeekInfo(weekStart);
  const existing = new Set(existingKeys);
  const candidates: MaterializationCandidate[] = [];
  let skippedExisting = 0;
  let skippedInactive = 0;

  for (const slot of slots) {
    if (slot.isActive === false) {
      skippedInactive += 1;
      continue;
    }
    const blockDate = dates[slot.dayOfWeek - 1];
    if (!blockDate) {
      skippedInactive += 1;
      continue;
    }
    if (existing.has(`${slot.id}:${blockDate}`)) {
      skippedExisting += 1;
      continue;
    }
    candidates.push({
      weeklySlotId: slot.id,
      blockDate,
      startTime: slot.startTime,
      durationMinutes: slot.durationMinutes,
      label: slot.label ?? null,
    });
  }

  return { candidates, skippedExisting, skippedInactive };
}

/** Cupos libres restantes; `null` = sin tope (D5). Nunca negativo. */
export function resolveCapacityRemaining(
  maxCapacity: number | null,
  currentCount: number,
): number | null {
  if (maxCapacity === null) return null;
  return Math.max(0, maxCapacity - currentCount);
}

export type AssignmentValidation =
  | { ok: true }
  | { ok: false; code: "AGENDA_CAPACITY"; remaining: number };

/** Validación all-or-nothing de cupo (D10): si no caben todos, no se escribe nada. */
export function validateAssignment(input: {
  maxCapacity: number | null;
  currentCount: number;
  requested: number;
}): AssignmentValidation {
  const remaining = resolveCapacityRemaining(input.maxCapacity, input.currentCount);
  if (remaining === null) return { ok: true };
  if (input.requested <= remaining) return { ok: true };
  return { ok: false, code: "AGENDA_CAPACITY", remaining };
}

export type AttendanceAggregates = {
  scheduled: number;
  completed: number;
  cancelled: number;
  attended: number;
  missed: number;
  total: number;
  attendanceRate: number | null;
};

/**
 * Agregados de asistencia tri-estado (`attended` true/false/null).
 * `attendanceRate` = attended / (attended + missed) con 3 decimales; `null` si no hay
 * asistencias marcadas (las clases futuras no penalizan).
 */
export function computeAttendanceAggregates(
  rows: ReadonlyArray<{ status: BlockStatus; attended: boolean | null }>,
): AttendanceAggregates {
  let scheduled = 0;
  let completed = 0;
  let cancelled = 0;
  let attended = 0;
  let missed = 0;

  for (const row of rows) {
    if (row.status === "scheduled") scheduled += 1;
    else if (row.status === "completed") completed += 1;
    else if (row.status === "cancelled") cancelled += 1;

    if (row.attended === true) attended += 1;
    else if (row.attended === false) missed += 1;
  }

  const rated = attended + missed;
  return {
    scheduled,
    completed,
    cancelled,
    attended,
    missed,
    total: rows.length,
    attendanceRate: rated === 0 ? null : Math.round((attended / rated) * 1000) / 1000,
  };
}

/**
 * EC-02: el horario de un bloque pasado no se edita (solo asistencia/estado).
 * Comparación lexicográfica de `YYYY-MM-DD` = cronológica.
 */
export function canEditTiming(
  block: { blockDate: string; status: BlockStatus },
  todayIso: string,
): boolean {
  return block.blockDate >= todayIso;
}

function isoDateInZone(timeZone: string, now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/**
 * "Hoy" en la zona del club (D18): `tz` lo resuelve el route handler
 * (`process.env.APP_TIMEZONE ?? 'UTC'`). Zona inválida ⇒ fallback UTC.
 */
export function todayInTimeZone(timeZone: string, now: Date): string {
  try {
    return isoDateInZone(timeZone, now);
  } catch (error) {
    if (error instanceof RangeError) return isoDateInZone("UTC", now);
    throw error;
  }
}

/** "lun 3 nov · 18:00" — día/mes por tabla de labels (sin depender del TZ del runtime). */
export function formatBlockDateTime(blockDate: string, startTime: string): string {
  if (!isValidDateStr(blockDate)) return `${blockDate} · ${startTime}`;
  const [, monthPart, dayPart] = blockDate.split("-") as [string, string, string];
  const month = Number(monthPart);
  const day = Number(dayPart);
  const weekday = new Date(`${blockDate}T00:00:00Z`).getUTCDay();
  const dayLabel = DAY_LABELS[weekday] ?? "";
  const monthLabel = MONTH_LABELS[month - 1] ?? "";
  return `${dayLabel} ${day} ${monthLabel} · ${startTime}`;
}
