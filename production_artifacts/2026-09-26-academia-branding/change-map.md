# Change Map — SPEC-EPIC-01: Administrador de Academia & Branding Institucional

> status: in-progress
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: admin+api+db+ui
> tags: [multi-tenancy, branding, pdf, roles, rubrics, migration, upload]

## 1. Mapeo de archivos

### Fase A — DB (agente: @db-engineer)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `lib/db/schema.ts` | MOD: +3 enums, +2 tablas, rubrics +2 cols, relations | — |
| `drizzle/0008_*.sql` | GEN: vía `pnpm run db:generate` (nunca SQL a mano) | schema.ts |
| `lib/db/queries/padel/academies.ts` | NEW: CRUD academias + membresías + resolveAcademyForEvaluation | schema.ts |
| `lib/db/queries/padel/rubrics.ts` | MOD: scope + guard institucional en get/update/archive/list | schema.ts |
| `lib/db/queries/padel/evaluations.ts` | MOD: + resolveAcademyForEvaluation | academies.ts |
| `tests/unit/db/academy-queries.test.ts` | NEW | academies.ts |

### Fase B — Auth (agente: @auth-security)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `lib/auth/academy-guard.ts` | NEW: guardAcademyOwner/Admin/Coach + getAcademyMembership | academies.ts |
| `lib/auth/protected-routes.ts` | MOD: documentar guards academia | academy-guard.ts |
| `lib/notifications/triggers.ts` | MOD: + triggerAcademyInvite | — |
| `tests/unit/auth/academy-guard.test.ts` | NEW | academy-guard.ts |

### Fase C — Lógica pura + validaciones (agente: @app-engineer, previo a endpoints)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `lib/validations/academy.ts` | NEW: schemas Zod + logo validation | — |
| `lib/padel/logo.ts` | NEW: MIME/dims/sanitize/data-URL | — |
| `lib/padel/radar.ts` | NEW: polígono radar 6 dims (puro) | — |
| `lib/padel/pdf.ts` | NEW: documento react-pdf (branding + radar + firma) | radar.ts, logo.ts |
| `tests/unit/padel/academy-schemas.test.ts` | NEW | validations/academy.ts |
| `tests/unit/padel/radar.test.ts` | NEW | radar.ts |
| `tests/unit/padel/logo.test.ts` | NEW | logo.ts |

### Fase D — Endpoints (agente: @app-engineer)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `app/api/academies/route.ts` | NEW: GET+POST | Fase A+B+C |
| `app/api/academies/[id]/route.ts` | NEW: GET+PUT+DELETE | idem |
| `app/api/academies/[id]/logo/route.ts` | NEW: POST multipart | logo.ts |
| `app/api/academies/[id]/members/invite/route.ts` | NEW: POST | academy-guard, triggers |
| `app/api/academies/[id]/members/[userId]/accept/route.ts` | NEW: POST | idem |
| `app/api/academies/[id]/members/route.ts` | NEW: GET | idem |
| `app/api/academies/[id]/members/[userId]/route.ts` | NEW: DELETE | idem |
| `app/api/academies/[id]/rubrics/route.ts` | NEW: GET+POST | rubrics.ts |
| `app/api/evaluations/[id]/pdf/route.ts` | NEW: GET PDF | pdf.ts, evaluations.ts |
| `app/api/rubrics/[id]/route.ts` | MOD: guard extendido PUT/DELETE | rubrics.ts |

### Fase E — UI (agente: @app-engineer)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `hooks/use-academies.ts` | NEW | Fase D |
| `app/(app)/academias/page.tsx` | NEW | use-academies |
| `app/(app)/academias/[id]/page.tsx` | NEW | idem |
| `components/padel/academy-card.tsx` | NEW | — |
| `components/padel/academy-form.tsx` | NEW | — |
| `components/padel/academy-detail.tsx` | NEW (tabs; si >300 líneas, split por tab) | — |
| `components/padel/logo-upload.tsx` | NEW | — |
| `components/padel/members-list.tsx` | NEW | — |
| `components/padel/invite-member-modal.tsx` | NEW | — |
| `components/padel/academy-rubrics-tab.tsx` | NEW | — |
| `components/padel/evaluation-detail.tsx` | MOD: botón Exportar PDF | pdf endpoint |
| `app/(app)/evaluaciones/[id]/page.tsx` | MOD: wire botón | idem |

### Fase F — Docs + API docs (agente: @app-engineer + @architect)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `lib/api-docs/schemas/academies.ts` | NEW | Fase D |
| `lib/api-docs/paths/academies.ts` | NEW | schemas |
| `lib/api-docs/spec.ts` | MOD: import + tags | paths/schemas |
| `FEATURES.md` | MOD: entrada SPEC-EPIC-01 | Fase D |
| `ARCHITECTURE.md` | MOD: sección v0.6 | Fase D |
| `.env.example` | SIN CAMBIOS (verificado: data-URL evita BLOB token) | — |

### Fase G — Tests API + E2E (agente: @app-engineer + @qa-release)

| Archivo | Acción | Depende de |
|---------|--------|------------|
| `tests/api/padel/academies-happy.spec.ts` | NEW | Fase D |
| `tests/api/padel/academies-guard.spec.ts` | NEW | Fase D |
| `tests/api/padel/members-happy.spec.ts` | NEW | Fase D |
| `tests/api/padel/institutional-rubrics-happy.spec.ts` | NEW | Fase D |
| `tests/api/padel/pdf-happy.spec.ts` | NEW | Fase D |
| `tests/e2e/academy-branding.spec.ts` | NEW | Fase E |

## 2. Dependencias entre cambios

```
Fase A (DB) ──► Fase B (auth) ──► Fase C (lógica pura) ──► Fase D (endpoints) ──► Fase E (UI)
     │                │                    │                       │                    │
     └────────────────┴────────────────────┴───────────────────────┴────────────────────┘
                                                                              │
                                                              Fase F (docs) ◄──┘
                                                              Fase G (tests) ◄──┘
```

- **Bloqueante**: Fase A antes de B/C/D (schema y queries son base).
- **Paralelizable**: Fase B y C pueden solaparse tras A (guards no dependen de radar/pdf).
- **Spike temprano**: validar `@react-pdf/renderer` con React 19 al inicio de Fase C (riesgo D1) — si falla, swap a `pdf-lib` sin tocar radar.ts.
- **Fase F y G** corren en paralelo tras D; F cierra antes de @qa-release.

## 3. Orden de ejecución sugerido

1. **Spike PDF** (0.5 día): instalar `@react-pdf/renderer`, `renderToBuffer` en route handler, dibujar radar de prueba. Decidir pin de versión.
2. **@db-engineer** (Fase A): schema → `db:generate` → `db:migrate` → verificar columnas con `information_schema` → queries → unit tests.
3. **@auth-security** (Fase B): guards + invitación + auditoría + unit tests.
4. **@app-engineer** (Fases C→D→E): lógica pura → endpoints → UI → API docs.
5. **@ponytail-reviewer**: revisión de simplicidad (data-URL sin deps, radar puro, sin abstracciones).
6. **@qa-release** (Fase G + cierre): tests API/E2E, test-matrix, acceptance-criteria, release-report, evidence-manifest.

## 4. Notas de tamaño

- `lib/db/schema.ts` (~750 líneas estimadas): excepción permitida (schema file).
- `components/padel/academy-detail.tsx` (~150 est.): si al implementar supera 300, split por tab (branding/miembros/rúbricas) en componentes hijos.
- `lib/db/queries/padel/academies.ts` (~220 est.): dentro de límite; si crece con resolveAcademyForEvaluation, mover a `evaluations.ts`.
- `lib/padel/pdf.ts` (~180 est.): dentro de límite; el radar vive en `radar.ts` (puro) para mantener el renderer delgado.