/**
 * Paths OpenAPI de la Evolución del Alumno (G7).
 * Referencias a schemas en lib/api-docs/schemas/padel.ts.
 */
export const padelEvolutionTags = {
  name: 'Padel Evolution',
  description: 'Evolución del alumno por categoría (guardUser + role USER + ACTIVE)',
};

export const evolutionPaths = {
  '/api/student/evolution': {
    get: {
      tags: ['Padel Evolution'],
      summary: 'Evolución del alumno (G7)',
      description: 'Evaluaciones publicadas agrupadas por categoría con tendencia (up/down/stable) entre la última y la anterior. Scoped al studentId de la sesión (anti-IDOR).',
      security: [{ bearerAuth: [] }],
      responses: {
        '200': {
          description: 'Evolución agrupada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  evolution: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/EvolutionGroupDto' },
                  },
                },
              },
            },
          },
        },
        '401': { description: 'No autenticado' },
        '403': { description: 'No autorizado (LOCKED o rol ADMIN)' },
      },
    },
  },
} as const;