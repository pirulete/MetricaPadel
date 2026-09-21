/**
 * Funciones puras del dashboard (Etapa 3, P01/A01).
 * Sin dependencias de DB: reciben valores ya calculados por las queries.
 */

export type CourseLevel = 'iniciacion' | 'intermedio' | 'avanzado';

/**
 * Deriva el nivel del alumno a partir del ratio (0-1) de su última evaluación
 * publicada. Sin evaluaciones → null.
 */
export function deriveLevel(ratio: number | null): CourseLevel | null {
  if (ratio === null) return null;
  if (ratio >= 0.75) return 'avanzado';
  if (ratio >= 0.5) return 'intermedio';
  return 'iniciacion';
}

const DAYS_OF_WEEK = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Día de la semana actual en formato corto español ("Lun", "Mar", …). */
export function todayLabel(date: Date = new Date()): string {
  return DAYS_OF_WEEK[(date.getDay() + 6) % 7]; // getDay(): 0=Dom → index 6
}

/** true si `days` (array de labels cortos) incluye el día de hoy. */
export function isClassToday(days: string[], date: Date = new Date()): boolean {
  return days.includes(todayLabel(date));
}