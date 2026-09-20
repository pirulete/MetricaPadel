/**
 * Helpers de fecha/hora para Street Move.
 *
 * Las fechas de check-ins se guardan como strings sin timezone
 * (`check_in_date` YYYY-MM-DD + `time_slot` HH:MM) y representan SIEMPRE
 * hora de Chile (el gimnasio está en Maipú, Santiago). El servidor (Vercel)
 * corre en UTC por defecto, por lo que `new Date(y, m, d, hh, mm)` con la TZ
 * del proceso interpreta mal el wall-clock chileno (desplazamiento 3-4h),
 * rompiendo los cutoffs horarios de reserva/cancelación.
 *
 * Estos helpers interpretan la fecha/hora como wall-clock de Chile de forma
 * explícita e independiente de la TZ del proceso (dev, CI o producción),
 * usando `Intl.DateTimeFormat` con `timeZone: 'America/Santiago'` (maneja
 * DST invierno UTC-4 / verano UTC-3 automáticamente).
 */

const CHILE_TIME_ZONE = 'America/Santiago'

interface ChileParts {
  y: number
  m: number
  d: number
  hh: number
  mm: number
}

const CHILE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: CHILE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function chileParts(date: Date): ChileParts {
  const parts = Object.fromEntries(
    CHILE_FORMATTER.formatToParts(date).map((p) => [p.type, p.value])
  )
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour),
    mm: Number(parts.minute),
  }
}

/** Offset en ms de Chile respecto a UTC en el instante dado (negativo: Chile va atrás). */
function chileOffsetMs(at: Date): number {
  const p = chileParts(at)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, 0, 0)
  return asUtc - at.getTime()
}

/**
 * Convierte un wall-clock de Chile (YYYY, MM, DD, HH, MM) al instante absoluto.
 * Dos pasadas de refinamiento del offset para converger en transiciones de DST
 * (los cambios ocurren ~02:00 local, lejos de los horarios de clase).
 */
function chileToUtcMs(y: number, mo: number, d: number, hh: number, mm: number): number {
  const asIfUtc = Date.UTC(y, mo - 1, d, hh, mm, 0, 0)
  let inst = asIfUtc
  for (let i = 0; i < 2; i++) {
    inst = asIfUtc - chileOffsetMs(new Date(inst))
  }
  return inst
}

/**
 * Crea un Date en el instante absoluto del inicio del día (00:00) en Chile
 * a partir de una fecha YYYY-MM-DD.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(chileToUtcMs(y, m, d, 0, 0))
}

/**
 * Crea un Date en el instante absoluto de la fecha+horario indicados,
 * interpretados como wall-clock de Chile (dateStr YYYY-MM-DD, timeStr HH:MM).
 */
export function parseLocalDateTime(dateStr: string, timeStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(chileToUtcMs(y, m, d, hh, mm))
}

/** Date del inicio de HOY (00:00) en Chile. */
export function todayInChile(): Date {
  const now = new Date()
  const p = chileParts(now)
  return new Date(chileToUtcMs(p.y, p.m, p.d, 0, 0))
}

/** Fecha de HOY en Chile como string YYYY-MM-DD. */
export function todayInChileStr(): string {
  const p = chileParts(new Date())
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`
}

/**
 * Día de la semana ISO (1 = lunes ... 7 = domingo) de una fecha YYYY-MM-DD.
 * Función pura sobre el string (parse UTC, independiente de la TZ del proceso),
 * equivalente al `dayOfWeek` de Temporal.PlainDate — usado para derivar la
 * semana (lunes) del dashboard admin en hora de Chile.
 */
export function getIsoDayOfWeek(dateStr: string): number {
  const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay() // 0=domingo..6=sábado
  return dow === 0 ? 7 : dow
}
