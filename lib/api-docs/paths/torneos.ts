/**
 * Paths OpenAPI del módulo Torneos (v0.12, M1 — motor TS).
 * Schemas en lib/api-docs/schemas/torneo.ts. Refleja el código real:
 * `app/api/torneos/**` + `app/api/internal/tournament-worker`.
 *
 * Guards:
 *  - 6 endpoints de coach: `guardAdmin` (ADMIN|SUPER_ADMIN + ACTIVE) + ownership
 *    `tournaments.ownerId` ⇒ recurso ajeno = **404** (anti-IDOR, nunca 403).
 *  - Worker: header `x-worker-secret` (sin sesión); secreto ausente en el
 *    entorno ⇒ 503 fail-closed.
 */
export const torneosTags = {
  name: 'Torneos',
  description: 'Torneos del coach: import del JSON canónico, detalle, instancia, generación de agenda (worker asíncrono) y archivado (guardAdmin + ownership, auditoría en mutaciones)',
};

export const torneosWorkerTags = {
  name: 'Torneos Worker',
  description: 'Endpoint interno del motor: claim atómico del run + solve + persistencia en 1 transacción. Autenticado por `x-worker-secret`, nunca por cookie de sesión',
};

const tournamentIdParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Torneo (debe pertenecer al coach)' } as const;
const runIdParam = { name: 'runId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }, description: 'Run del torneo (de otro torneo ⇒ 404)' } as const;

const unauthorized = { description: 'No autenticado (401)' } as const;
const forbidden = { description: 'No autorizado: rol distinto de ADMIN/SUPER_ADMIN o status no ACTIVE (403). LOCKED nunca pasa' } as const;
const notFound = { description: 'Torneo no encontrado o ajeno (anti-IDOR: 404, nunca 403)' } as const;
const internalError = { description: 'Error interno del servidor' } as const;
const invalidQuery = { description: 'Query inválida (Zod): `{ error, details }`' } as const;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown) => ({ 'application/json': { schema } });

export const torneosPaths = {
  '/api/torneos': {
    get: {
      tags: ['Torneos'],
      summary: 'Listar torneos del coach',
      description: 'Lista los torneos con `ownerId` = coach autenticado, más recientes primero. Paginación por cursor (G15) sobre `updatedAt`: `?limit=&cursor=`.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'limit', in: 'query', required: false, schema: { type: 'integer', minimum: 1, maximum: 50 }, description: 'Default 20, máximo 50' },
        { name: 'cursor', in: 'query', required: false, schema: { type: 'string', format: 'date-time' }, description: 'ISO del último item de la página anterior (`updatedAt`)' },
      ],
      responses: {
        '200': {
          description: 'Página de torneos',
          content: json({
            type: 'object',
            required: ['items', 'nextCursor'],
            properties: {
              items: { type: 'array', items: ref('TorneoSummary') },
              nextCursor: { type: 'string', nullable: true, description: 'null en la última página' },
            },
          }),
        },
        '400': invalidQuery,
        '401': unauthorized,
        '403': forbidden,
        '500': internalError,
      },
    },
    post: {
      tags: ['Torneos'],
      summary: 'Importar torneo (JSON del cargador)',
      description: [
        'Valida con el cargador puro (`parseTournamentInput`: forma + reglas R0–R6 con `path`) y persiste en **1 transacción** (0 filas si falla, AC-02).',
        'Códigos: 400 = error de forma/regla · 422 = instancia imposible de agendar (`instance_too_large` | `match_without_allowed_block`); con errores mezclados el `code` es el del primer 422, y sin ninguno `invalid_instance` (O-m5).',
        '**Sin 409**: M1 no tiene re-import por id (`technical-design-v2` §a.1). Rate limit por IP (429). Techo de payload 2 MiB (413). Audita CREATE (`tournament`).',
      ].join(' '),
      security: [{ bearerAuth: [] }],
      requestBody: { required: true, content: json(ref('TorneoImportRequest')) },
      responses: {
        '201': { description: 'Torneo importado', content: json(ref('TorneoImportResponse')) },
        '400': { description: 'JSON inválido (`invalid_json`) o errores de forma/regla del cargador', content: json(ref('TorneoImportError')) },
        '401': unauthorized,
        '403': forbidden,
        '413': {
          description: 'Payload > 2 MiB (`content-length` declarado)',
          content: json({ type: 'object', properties: { error: { type: 'string' }, code: { type: 'string', enum: ['payload_too_large'] } } }),
        },
        '422': { description: 'Instancia imposible de agendar (R0/R6): no se persiste nada', content: json(ref('TorneoImportError')) },
        '429': { description: 'Rate limit por IP excedido (429)' },
        '500': internalError,
      },
    },
  },

  '/api/torneos/{id}': {
    get: {
      tags: ['Torneos'],
      summary: 'Detalle del torneo',
      description: [
        'Torneo + `counts` + bloques + `activeRun` (queued|running, a lo sumo 1) + `currentRun` (último `succeeded|invalid` por query directa).',
        '`counts` **no** incluye `courts`: el número de canchas vive en `tournament.courts` (`technical-design-v2` §a.3).',
        'Efecto lateral barato: reaper perezoso de runs vencidos (sin cron).',
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [tournamentIdParam],
      responses: {
        '200': { description: 'Detalle del torneo', content: json(ref('TorneoDetailResponse')) },
        '400': { description: '`id` no es un uuid válido (Zod)' },
        '401': unauthorized,
        '403': forbidden,
        '404': notFound,
        '500': internalError,
      },
    },
  },

  '/api/torneos/{id}/instancia': {
    get: {
      tags: ['Torneos'],
      summary: 'Espejo canónico de la instancia (AC-04)',
      description: 'Reconstruye desde DB el mismo objeto que consume el motor (bloques con `capacity`, parejas con bloqueados, personas con sus parejas, partidos con `gruposOrigen`/`alimentadores`) para auditar el import y poder exportar-corregir-reimportar. Solo lectura: sin auditoría.',
      security: [{ bearerAuth: [] }],
      parameters: [tournamentIdParam],
      responses: {
        '200': { description: 'Instancia reconstruida', content: json(ref('TorneoInstanciaResponse')) },
        '400': { description: '`id` no es un uuid válido (Zod)' },
        '401': unauthorized,
        '403': forbidden,
        '404': notFound,
        '500': internalError,
      },
    },
  },

  '/api/torneos/{id}/agenda': {
    post: {
      tags: ['Torneos'],
      summary: 'Generar agenda (encola un run)',
      description: [
        'Orden de validación: 404 (anti-IDOR) → 409 `archived` (EC-13) → 400 body → 422 `infeasible_occupancy` (pre-check `computeSemaforo` con ρ > 1 y `force !== true`, **sin crear run**, EC-01) → 409 `run_active` (índice UNIQUE parcial, EC-11) → 202.',
        '`timeLimitMs` se clampa server-side a `[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`: el body nunca bypassa el techo (AC-09). El valor efectivo queda en `tournament_runs.params`.',
        '202 en < 2 s: el solve corre en el worker (`dispatchRun` fire-and-forget) y el cliente hace polling en `/runs/{runId}`. Rate limit por IP. Audita CREATE (`tournament_run`).',
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [tournamentIdParam],
      requestBody: { required: false, content: json(ref('TorneoAgendaRequest')) },
      responses: {
        '202': { description: 'Run encolado (`status: queued`)', content: json(ref('TorneoAgendaAccepted')) },
        '400': { description: 'JSON inválido (`invalid_json`) o body fuera del schema (`mipRelGap` fuera de 0..1)' },
        '401': unauthorized,
        '403': forbidden,
        '404': notFound,
        '409': {
          description: 'Torneo archivado (`archived`) o ya hay un run `queued|running` (`run_active`)',
          content: json({
            oneOf: [ref('TorneoArchivedError'), ref('TorneoRunActiveError')],
          }),
        },
        '422': { description: 'Ocupación declarada > 1 sin `force` (no se crea run)', content: json(ref('TorneoInfeasibleOccupancyError')) },
        '429': { description: 'Rate limit por IP excedido (429)' },
        '500': internalError,
      },
    },
  },

  '/api/torneos/{id}/runs/{runId}': {
    get: {
      tags: ['Torneos'],
      summary: 'Estado del run (polling)',
      description: [
        'Resumen congelado (`RunSummary`): estado, métricas del solver y `diagnostics: Diagnosis | null` (semáforo + indicadores + errores del verificador).',
        '`?include=slots` añade la agenda del run (partido, bloque, cancha, día y hora del bloque). Un run no terminal devuelve `slots: []` y `slotsCount: 0`.',
        'Ordering: ownership del torneo primero (404) y luego reaper perezoso con re-despacho fire-and-forget. El polling se detiene en cualquier estado terminal.',
      ].join(' '),
      security: [{ bearerAuth: [] }],
      parameters: [
        tournamentIdParam,
        runIdParam,
        { name: 'include', in: 'query', required: false, schema: { type: 'string', enum: ['slots'] }, description: 'Añade `run.slots`' },
      ],
      responses: {
        '200': { description: 'Estado del run', content: json(ref('TorneoRunResponse')) },
        '400': { description: '`id`/`runId` no son uuid o `include` distinto de `slots` (Zod)' },
        '401': unauthorized,
        '403': forbidden,
        '404': { description: 'Torneo ajeno/inexistente o run que no pertenece a ese torneo' },
        '500': internalError,
      },
    },
  },

  '/api/torneos/{id}/archive': {
    post: {
      tags: ['Torneos'],
      summary: 'Archivar torneo (soft)',
      description: 'Soft archive: `status = archived`. Nunca DELETE — la instancia y los slots históricos siguen consultables. 409 si ya estaba archivado (EC-13). Audita UPDATE (`tournament`).',
      security: [{ bearerAuth: [] }],
      parameters: [tournamentIdParam],
      responses: {
        '200': {
          description: 'Torneo archivado',
          content: json({ type: 'object', required: ['archived'], properties: { archived: { type: 'boolean', enum: [true] } } }),
        },
        '400': { description: '`id` no es un uuid válido (Zod)' },
        '401': unauthorized,
        '403': forbidden,
        '404': notFound,
        '409': { description: 'El torneo ya está archivado', content: json(ref('TorneoAlreadyArchivedError')) },
        '500': internalError,
      },
    },
  },

  '/api/internal/tournament-worker': {
    post: {
      tags: ['Torneos Worker'],
      summary: 'Ejecutar un run encolado (interno)',
      description: [
        'Sin sesión: `x-worker-secret` (`timingSafeEqual` sobre sha256, longitudes constantes). Secreto ausente en el entorno ⇒ 503 `worker_not_configured` (fail-closed, nunca "sin auth"); header inválido ⇒ 401.',
        'Claim atómico `UPDATE … WHERE status=\'queued\'` (idempotente): 0 filas ⇒ 409 `not_claimed`. Luego `buildInstance` → `runEngine` → `finishRun` en **1 transacción** (estado terminal + slots + `tournaments.status = agenda_draft`): nunca queda agenda parcial. `infeasible`/`failed` persisten 0 slots.',
        '`maxDuration = 300`. No acepta cookie como alternativa al secreto y nunca devuelve el secreto. Audita UPDATE (`tournament_run`) fuera de la transacción.',
      ].join(' '),
      security: [],
      parameters: [
        { name: 'x-worker-secret', in: 'header', required: true, schema: { type: 'string' }, description: '`TOURNAMENT_WORKER_SECRET` (≥32 chars)' },
      ],
      requestBody: { required: true, content: json(ref('TorneoWorkerRequest')) },
      responses: {
        '200': { description: 'Run cerrado', content: json(ref('TorneoWorkerResponse')) },
        '400': { description: 'JSON inválido o `runId` no uuid (`invalid_body`)', content: json(ref('TorneoWorkerError')) },
        '401': { description: 'Header `x-worker-secret` ausente o inválido' },
        '409': { description: 'El run no estaba `queued` o ya fue cerrado por el reaper (`not_claimed`) — reintento seguro', content: json(ref('TorneoWorkerError')) },
        '500': internalError,
        '503': { description: 'Worker no configurado: falta `TOURNAMENT_WORKER_SECRET` (fail-closed)', content: json(ref('TorneoWorkerError')) },
      },
    },
  },
}
