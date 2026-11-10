/**
 * Schemas OpenAPI del módulo Torneos (v0.12, M1 — motor TS).
 *
 * Reflejan el **código real** (routes de `app/api/torneos/**` y
 * `app/api/internal/tournament-worker`), no el diseño original. Desviaciones
 * aceptadas en `technical-design-v2` §a:
 *  - `counts` del detalle **sin** `courts` (las canchas van en `tournament.courts`).
 *  - `POST /api/torneos` **sin** `409 runs_exist` (no hay re-import en M1).
 *  - `meta.blockMinutes` es el literal `75` (`calendar.ts` fija `BLOQUE_MIN`).
 *  - `calendario[].dia` es `string(1..3)`, no enum (`varchar(3)` en DB).
 *  - `diagnostics` es `TorneoDiagnosis | null`, nunca `unknown`.
 */
export const torneoSchemas = {
  // -------------------------------------------------------------------------
  // Import (POST /api/torneos)
  // -------------------------------------------------------------------------
  TorneoImportRequest: {
    type: 'object',
    required: ['meta', 'calendario', 'categorias', 'parejas'],
    description: 'JSON de intercambio del cargador (`lib/motor-torneo/loader.ts`). Es la autoridad de negocio: reglas R0–R6 con `path` por campo.',
    properties: {
      meta: { $ref: '#/components/schemas/TorneoImportMeta' },
      calendario: { type: 'array', minItems: 1, items: { $ref: '#/components/schemas/TorneoImportTramo' } },
      capacidad_especial: {
        type: 'object',
        description: 'Excepción de capacidad por índice de bloque (`{ "3": 4 }`). Ausente = capacidad estándar de `meta.courts`.',
        additionalProperties: { type: 'integer', minimum: 0, maximum: 24 },
      },
      categorias: {
        type: 'object',
        description: 'Clave = código de categoría (1..10 chars).',
        additionalProperties: { $ref: '#/components/schemas/TorneoImportCategory' },
      },
      parejas: {
        type: 'object',
        description: 'Clave = código de pareja (1..20 chars).',
        additionalProperties: { $ref: '#/components/schemas/TorneoImportTeam' },
      },
    },
  },
  TorneoImportMeta: {
    type: 'object',
    required: ['name', 'startDate', 'endDate', 'courts'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 200 },
      startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-11-13' },
      endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-11-15' },
      courts: { type: 'integer', minimum: 1, maximum: 24 },
      blockMinutes: {
        type: 'integer',
        enum: [75],
        description: 'Literal 75: `calendar.ts` fija `BLOQUE_MIN` en M1. Cualquier otro valor ⇒ 400 `invalid_schema` (technical-design-v2 §a.2).',
      },
    },
  },
  TorneoImportTramo: {
    type: 'object',
    required: ['dia', 'inicio', 'bloques', 'fase', 'extension'],
    properties: {
      dia: { type: 'string', minLength: 1, maxLength: 3, example: 'Vie', description: '`varchar(3)` en DB: `Jue`, `Vie`, `Sab`, `Dom`…' },
      inicio: { type: 'string', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$', example: '18:00' },
      bloques: { type: 'integer', minimum: 1, maximum: 24, description: 'Cantidad de bloques consecutivos desde `inicio`' },
      fase: { type: 'string', enum: ['previa', 'final'] },
      extension: { type: 'boolean', description: 'Tramo de extensión (penalizado por el objetivo)' },
    },
  },
  TorneoImportCategory: {
    type: 'object',
    required: ['sexo', 'grupos'],
    properties: {
      sexo: { type: 'string', enum: ['H', 'M'] },
      nivel: { type: 'integer', minimum: 1, maximum: 10, description: 'Ausente = sin nivel declarado' },
      grupos: {
        type: 'object',
        description: 'Clave = código de grupo (1..8 chars); valor = códigos de pareja.',
        additionalProperties: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 20 } },
      },
    },
  },
  TorneoImportTeam: {
    type: 'object',
    required: ['personas'],
    properties: {
      personas: {
        type: 'array',
        minItems: 2,
        maxItems: 2,
        items: { type: 'string', minLength: 1, maxLength: 50 },
        description: 'Exactamente 2 documentos de persona',
      },
      no_disponible: {
        type: 'array',
        items: { type: 'integer', minimum: 0 },
        default: [],
        description: 'Índices de bloque de previa prohibidos para la pareja',
      },
    },
  },
  TorneoImportCounts: {
    type: 'object',
    description: 'Conteos persistidos por el import (1 transacción: 0 filas si falla).',
    properties: {
      blocks: { type: 'integer' },
      categories: { type: 'integer' },
      groups: { type: 'integer' },
      teams: { type: 'integer' },
      persons: { type: 'integer' },
      matchesPrevia: { type: 'integer' },
      matchesFinal: { type: 'integer' },
      matches: { type: 'integer' },
    },
  },
  TorneoImportResponse: {
    type: 'object',
    required: ['tournamentId', 'counts'],
    properties: {
      tournamentId: { type: 'string', format: 'uuid' },
      counts: { $ref: '#/components/schemas/TorneoImportCounts' },
    },
  },
  TorneoLoaderError: {
    type: 'object',
    required: ['code', 'path', 'message'],
    properties: {
      code: {
        type: 'string',
        enum: [
          'invalid_schema',
          'calendar_invalid',
          'duplicate_team',
          'orphan_team',
          'team_in_two_categories',
          'person_two_teams_same_category',
          'availability_invalid_block',
          'availability_too_many',
          'group_invalid_size',
          'match_without_allowed_block',
          'instance_too_large',
        ],
        description: '`instance_too_large` y `match_without_allowed_block` son de clase 422; el resto de clase 400.',
      },
      path: { type: 'string', example: 'parejas[p101].no_disponible[2]', description: 'Ruta legible del campo culpable' },
      message: { type: 'string' },
    },
  },
  TorneoImportError: {
    type: 'object',
    required: ['error'],
    description: '400/422 del cargador. En 422 el `code` es el del primer error de clase 422 (`instance_too_large` | `match_without_allowed_block`) o `invalid_instance`; `details` acumula todos los errores (O-m5).',
    properties: {
      error: { type: 'string' },
      code: { type: 'string', example: 'invalid_instance' },
      details: { type: 'array', items: { $ref: '#/components/schemas/TorneoLoaderError' } },
    },
  },

  // -------------------------------------------------------------------------
  // Listado (GET /api/torneos)
  // -------------------------------------------------------------------------
  TorneoSummary: {
    type: 'object',
    description: 'Item de `GET /api/torneos` (cards de `/torneos`).',
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string' },
      status: { $ref: '#/components/schemas/TorneoStatus' },
      startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      courts: { type: 'integer' },
      blockMinutes: { type: 'integer', description: 'Siempre 75 en M1' },
      updatedAt: { type: 'string', format: 'date-time' },
      counts: {
        type: 'object',
        properties: {
          categories: { type: 'integer' },
          teams: { type: 'integer' },
          matches: { type: 'integer' },
        },
      },
    },
  },
  TorneoStatus: {
    type: 'string',
    enum: ['draft', 'agenda_draft', 'archived'],
    description: 'Importado = `draft`; con agenda persistida = `agenda_draft`; archivar es soft (`archived`, nunca DELETE).',
  },

  // -------------------------------------------------------------------------
  // Detalle (GET /api/torneos/[id])
  // -------------------------------------------------------------------------
  TorneoDetailResponse: {
    type: 'object',
    required: ['tournament', 'counts', 'blocks', 'activeRun', 'currentRun'],
    properties: {
      tournament: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          status: { $ref: '#/components/schemas/TorneoStatus' },
          startDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          endDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          courts: { type: 'integer', description: 'Único lugar del payload que expone el número de canchas (`counts.courts` no existe: technical-design-v2 §a.3)' },
          blockMinutes: { type: 'integer' },
          params: { type: 'object', additionalProperties: true, description: 'Snapshot de política del modelo (`W_*`, `maxSeguidos`, …)' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      counts: {
        type: 'object',
        description: 'Agregados del torneo. Sin `courts` (technical-design-v2 §a.3).',
        properties: {
          blocks: { type: 'integer' },
          categories: { type: 'integer' },
          groups: { type: 'integer' },
          teams: { type: 'integer' },
          matches: { type: 'integer' },
          matchesPrevia: { type: 'integer' },
          matchesFinal: { type: 'integer' },
        },
      },
      blocks: { type: 'array', items: { $ref: '#/components/schemas/TorneoBlock' } },
      activeRun: { allOf: [{ $ref: '#/components/schemas/TorneoRunSummary' }], nullable: true, description: 'Run `queued|running` (a lo sumo 1: índice UNIQUE parcial)' },
      currentRun: { allOf: [{ $ref: '#/components/schemas/TorneoRunSummary' }], nullable: true, description: 'Último run `succeeded|invalid` por query directa (O-m6)' },
    },
  },
  TorneoBlock: {
    type: 'object',
    description: 'Bloque aritado del calendario (`calendar.ts`).',
    properties: {
      idx: { type: 'integer', description: '0..N-1, orden del calendario' },
      dayLabel: { type: 'string', maxLength: 3, example: 'Vie' },
      startTime: { type: 'string', example: '18:00', description: 'HH:mm' },
      phase: { type: 'string', enum: ['previa', 'final'] },
      isExtension: { type: 'boolean' },
      capacity: { type: 'integer', description: 'Canchas del bloque (respeta `capacidad_especial`)' },
    },
  },

  // -------------------------------------------------------------------------
  // Instancia (GET /api/torneos/[id]/instancia)
  // -------------------------------------------------------------------------
  TorneoInstanciaResponse: {
    type: 'object',
    required: ['instancia'],
    properties: {
      instancia: {
        type: 'object',
        description: 'Espejo canónico reconstruido desde DB (AC-04 round-trip): el mismo objeto que consume el motor, para auditar el import y exportar-corregir-reimportar.',
        properties: {
          bloques: { type: 'array', items: { $ref: '#/components/schemas/TorneoBlock' } },
          nCanchas: { type: 'integer' },
          categorias: { type: 'object', additionalProperties: true, description: 'Clave = código de categoría' },
          grupos: { type: 'object', additionalProperties: true, description: 'Clave = código de grupo' },
          parejas: { type: 'object', additionalProperties: true, description: 'Clave = código de pareja' },
          personas: { type: 'object', additionalProperties: true, description: 'Clave = documento de persona' },
          partidos: { type: 'object', additionalProperties: true, description: 'Clave = código de partido' },
        },
      },
    },
  },

  // -------------------------------------------------------------------------
  // Generación de agenda (POST /api/torneos/[id]/agenda)
  // -------------------------------------------------------------------------
  TorneoAgendaRequest: {
    type: 'object',
    description: 'Body opcional. `timeLimitMs` se clampa server-side (`[30_000, min(240_000, TOURNAMENT_MAX_TIME_LIMIT_MS)]`): un valor fuera de rango no bypassa el techo (AC-09).',
    properties: {
      timeLimitMs: { type: 'number', description: 'Presupuesto del solver en ms; valor efectivo guardado en `tournament_runs.params`' },
      mipRelGap: { type: 'number', minimum: 0, maximum: 1, description: 'Default del solver 0.01' },
      force: { type: 'boolean', description: 'Genera aunque ρ > 1 en alguna fase (EC-01)' },
    },
  },
  TorneoAgendaAccepted: {
    type: 'object',
    required: ['runId', 'status'],
    properties: {
      runId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['queued'] },
    },
  },
  TorneoRunActiveError: {
    type: 'object',
    required: ['error', 'code'],
    description: '409 del índice UNIQUE parcial `tournament_runs_active_uq` (EC-11).',
    properties: {
      error: { type: 'string' },
      code: { type: 'string', enum: ['run_active'] },
      activeRunId: { type: 'string', format: 'uuid', nullable: true, description: 'null si el run activo no aparece en la ventana de lectura' },
    },
  },
  TorneoInfeasibleOccupancyError: {
    type: 'object',
    required: ['error', 'code', 'semaforo'],
    description: '422 del pre-check `computeSemaforo`, **sin crear run** (EC-01).',
    properties: {
      error: { type: 'string' },
      code: { type: 'string', enum: ['infeasible_occupancy'] },
      semaforo: { $ref: '#/components/schemas/TorneoSemaforo' },
    },
  },
  TorneoArchivedError: {
    type: 'object',
    required: ['error', 'code'],
    properties: {
      error: { type: 'string' },
      code: { type: 'string', enum: ['archived'] },
    },
  },
  TorneoAlreadyArchivedError: {
    type: 'object',
    required: ['error', 'code'],
    properties: {
      error: { type: 'string' },
      code: { type: 'string', enum: ['already_archived'] },
    },
  },

  // -------------------------------------------------------------------------
  // Runs (GET /api/torneos/[id]/runs/[runId])
  // -------------------------------------------------------------------------
  TorneoRunSummary: {
    type: 'object',
    description: 'DTO de polling congelado (`toRunSummary`): sin `tournamentId`/`createdAt`/`dispatchAttempts`.',
    required: ['runId', 'status', 'slotsCount'],
    properties: {
      runId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'infeasible', 'failed', 'invalid'] },
      engineStatus: { type: 'string', nullable: true, enum: ['optimal', 'feasible_time_limit', 'infeasible', 'unbounded', 'error', null], description: 'varchar(32) en DB: no es enum de Postgres' },
      objective: { type: 'number', nullable: true },
      mipGap: { type: 'number', nullable: true },
      timeMs: { type: 'integer', nullable: true },
      slotsCount: { type: 'integer', description: '0 mientras el run no es terminal' },
      startedAt: { type: 'string', format: 'date-time', nullable: true },
      finishedAt: { type: 'string', format: 'date-time', nullable: true },
      error: {
        allOf: [{ $ref: '#/components/schemas/TorneoRunError' }],
        nullable: true,
      },
      diagnostics: {
        allOf: [{ $ref: '#/components/schemas/TorneoDiagnosis' }],
        nullable: true,
        description: 'null hasta que el run termina',
      },
    },
  },
  TorneoRunError: {
    type: 'object',
    required: ['code'],
    properties: {
      code: {
        type: 'string',
        description: '`solver_error`, `timeout`, `engine_unavailable`, `instance_build_failed`, `verification_failed`, `dispatch_failed`, `worker_crash`',
        example: 'verification_failed',
      },
      message: { type: 'string' },
    },
  },
  TorneoRunResponse: {
    type: 'object',
    required: ['run'],
    properties: {
      run: { $ref: '#/components/schemas/TorneoRunDetail' },
    },
  },
  TorneoRunDetail: {
    allOf: [
      { $ref: '#/components/schemas/TorneoRunSummary' },
      {
        type: 'object',
        properties: {
          slots: {
            type: 'array',
            description: 'Solo con `?include=slots`. Un run no terminal devuelve `[]` y `slotsCount: 0`.',
            items: { $ref: '#/components/schemas/TorneoRunSlot' },
          },
        },
      },
    ],
  },
  TorneoRunSlot: {
    type: 'object',
    properties: {
      matchId: { type: 'string', format: 'uuid' },
      code: { type: 'string', example: '3ra-G1-P1' },
      categoryCode: { type: 'string', example: '3ra' },
      phase: { type: 'string', enum: ['previa', 'final'] },
      round: { type: 'string', enum: ['grupo', '16vos', '8vos', '4tos', 'semi', 'final'] },
      blockIdx: { type: 'integer' },
      court: { type: 'integer', description: 'Cancha 1..N asignada por post-proceso voraz' },
      dayLabel: { type: 'string', maxLength: 3, example: 'Vie' },
      startTime: { type: 'string', example: '18:00' },
    },
  },

  // -------------------------------------------------------------------------
  // Diagnóstico (semáforo + indicadores)
  // -------------------------------------------------------------------------
  TorneoSemaforo: {
    type: 'object',
    required: ['previa', 'final'],
    description: 'Semáforo por fase (ρ = partidos / casillas, sin extensión).',
    properties: {
      previa: { $ref: '#/components/schemas/TorneoSemaforoPhase' },
      final: { $ref: '#/components/schemas/TorneoSemaforoPhase' },
    },
  },
  TorneoSemaforoPhase: {
    type: 'object',
    properties: {
      phase: { type: 'string', enum: ['previa', 'final'] },
      matches: { type: 'integer' },
      capacity: { type: 'integer' },
      occupancy: { type: 'number', description: 'ρ. > 1 ⇒ `rojo` y 422 en `/agenda` sin `force`' },
      extensionCapacity: { type: 'integer' },
      color: { type: 'string', enum: ['verde', 'amarillo', 'rojo'] },
    },
  },
  TorneoDiagnosis: {
    type: 'object',
    required: ['status', 'timeMs', 'verificationErrors'],
    description: 'Diagnóstico del run: estado del solver + 6 indicadores + ocupación por tramo + errores del verificador.',
    properties: {
      status: { type: 'string', enum: ['optimal', 'feasible_time_limit', 'infeasible', 'unbounded', 'error'] },
      objective: { type: 'number', nullable: true },
      mipGap: { type: 'number', nullable: true },
      timeMs: { type: 'integer' },
      extensionMatches: { type: 'integer' },
      occupancyByTramo: { type: 'array', items: { $ref: '#/components/schemas/TorneoTramoOccupancy' } },
      gruposComoUnidad: { $ref: '#/components/schemas/TorneoRatio' },
      gruposMismoDia: { $ref: '#/components/schemas/TorneoRatio' },
      gruposMismaCancha: { $ref: '#/components/schemas/TorneoRatio' },
      parejasUnDia: { $ref: '#/components/schemas/TorneoRatio' },
      parejasDosDias: { type: 'integer' },
      maxBloquesSeguidos: { type: 'integer' },
      partidosHorarioLaboral: { type: 'integer' },
      doubleCategoryClashes: { type: 'integer' },
      verificationErrors: { type: 'array', items: { $ref: '#/components/schemas/TorneoVerificationError' } },
    },
  },
  TorneoRatio: {
    type: 'object',
    properties: {
      count: { type: 'integer' },
      total: { type: 'integer' },
    },
  },
  TorneoTramoOccupancy: {
    type: 'object',
    properties: {
      dayLabel: { type: 'string', maxLength: 3 },
      phase: { type: 'string', enum: ['previa', 'final'] },
      isExtension: { type: 'boolean' },
      matches: { type: 'integer' },
      capacity: { type: 'integer' },
    },
  },
  TorneoVerificationError: {
    type: 'object',
    required: ['code', 'message'],
    properties: {
      code: {
        type: 'string',
        enum: ['missing', 'capacity', 'court_collision', 'court_range', 'person_overlap', 'availability', 'precedence', 'phase'],
      },
      message: { type: 'string' },
      matchId: { type: 'string' },
      blockIdx: { type: 'integer' },
      court: { type: 'integer' },
    },
  },

  // -------------------------------------------------------------------------
  // Worker (POST /api/internal/tournament-worker)
  // -------------------------------------------------------------------------
  TorneoWorkerRequest: {
    type: 'object',
    required: ['runId'],
    properties: {
      runId: { type: 'string', format: 'uuid', description: 'Run en estado `queued` a reclamar' },
    },
  },
  TorneoWorkerResponse: {
    type: 'object',
    required: ['runId', 'status'],
    properties: {
      runId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['succeeded', 'infeasible', 'failed', 'invalid'] },
      timeMs: { type: 'integer', description: 'Tiempo del solver reportado por el diagnóstico' },
      slotsCount: { type: 'integer', description: '0 en `infeasible`/`failed` (nunca agenda parcial)' },
      verifyErrors: { type: 'integer', description: 'Cantidad de errores del verificador independiente' },
    },
  },
  TorneoWorkerError: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string' },
      code: {
        type: 'string',
        enum: ['worker_not_configured', 'not_claimed', 'invalid_body', 'instance_build_failed'],
        description: '`worker_not_configured` ⇒ 503 fail-closed; `not_claimed` ⇒ 409 idempotente',
      },
      details: { type: 'array', items: { type: 'object' } },
    },
  },

  // -------------------------------------------------------------------------
  // Errores genéricos
  // -------------------------------------------------------------------------
  TorneoError: {
    type: 'object',
    required: ['error'],
    properties: {
      error: { type: 'string' },
      code: { type: 'string' },
      details: { type: 'array', items: { type: 'object' }, description: 'Issues de Zod o errores del import, según el endpoint' },
    },
  },
}
