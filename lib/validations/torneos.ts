import { z } from "zod";

/**
 * Schemas de request del módulo Torneos (M1).
 *
 * El body del **import** (`POST /api/torneos`) NO vive aquí: lo valida
 * `lib/motor-torneo/loader.ts` (forma + reglas de negocio acumuladas con `path`).
 * Duplicarlo en dos sitios crearía dos verdades que se desincronizan
 * (`technical-design-v2` §a.6, O-m8).
 *
 * Paginación G15: los listados reutilizan `paginationQuerySchema` de
 * `lib/validations/padel.ts` (ya consumido por F2b); no se re-exporta para no
 * añadir una indirección sin consumidor.
 */

/**
 * `POST /api/torneos/[id]/agenda` — body opcional (technical-design §6.4).
 *
 * - `timeLimitMs`: presupuesto del solver. **No se valida el rango aquí**: el
 *   clamp real es server-side en `lib/torneos/limits.ts`
 *   (`[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`), de modo que un
 *   valor fuera de rango nunca bypassa el techo (AC-09); se recorta y el valor
 *   efectivo queda en `tournament_runs.params`.
 * - `mipRelGap`: 0..1 (default del solver: `0.01`).
 * - `force`: admite generar aunque la ocupación declarada sea > 1 (EC-01).
 */
export const generateAgendaSchema = z.object({
  timeLimitMs: z.number().finite().optional(),
  mipRelGap: z.number().min(0).max(1).optional(),
  force: z.boolean().optional(),
});

/**
 * `GET /api/torneos/[id]/runs/[runId]` — query params (§6.6).
 * `?include=slots` añade la agenda del run; por defecto solo el resumen.
 */
export const runQuerySchema = z.object({
  include: z.enum(["slots"]).optional(),
});
