# Release Scope — SPEC-EPIC-01: Administrador de Academia & Branding Institucional

> status: proposed
> release: v0.6
> date: 2026-09-26
> change_id: spec-epic-01-academia-branding
> module: admin+api+db+ui
> tags: [multi-tenancy, branding, pdf, roles, rubrics, migration, upload]

## Alcance del release v0.6

| ID | Feature | RF | Prioridad | Depende de |
|----|---------|----|-----------|------------|
| A1 | Entidad Academia + branding (crear, editar, archivar, logo, color) | RF-01 | H1 | — |
| A2 | Membresías de profesores multi-academia (invitar por email, aceptar, listar, remover) | RF-02 | H1 | A1 |
| A3 | Rúbricas institucionales (scope, guard read-only para COACH) | RF-03 | H1 | A1 |
| A4 | Exportación PDF con branding + radar 6 dimensiones + firma | RF-04 | H1 | A1, A3 |
| A5 | Auditoría + notificaciones (trigger `academy.invite`) + API docs | transversal | H1 | A1-A4 |

## Fuera de alcance del release v0.6

- Billing/planes por academia.
- Aislamiento multi-tenant total (alumnos/cursos por academia).
- Portal público por academia.
- Transferencia de ownership.
- CSV de miembros.

## Orden de ejecución sugerido

1. **A1** (DB + API + UI academia) → base para todo.
2. **A2** (membresías + invitación) → habilita profesores.
3. **A3** (rúbricas institucionales + guard) → habilita estandarización.
4. **A4** (PDF) → depende de A1 (branding) y A3 (rúbrica institucional en evaluación).
5. **A5** (auditoría/notificaciones/docs) → transversal, se cierra al final.

## Criterios de salida del release

- Todos los acceptance criteria AC-01..AC-07 de `feature-spec.md` cumplidos.
- Gates del harness: typecheck 0 errores, lint 0 errores, build exitoso, unit + API + E2E pasando, cobertura del módulo sin regresión >3%, API docs actualizadas, FEATURES.md actualizado.
- Migración verificada en DB (`information_schema.columns` para `academies`, `academy_memberships`, `rubrics.academy_id`, `rubrics.scope`).

## Riesgos

- **Dependencia PDF nueva**: riesgo de integración/build — mitigar con spike temprano de @architect (A4 al final del orden, pero spike al inicio).
- **Storage de logo**: sin S3 en el proyecto — decisión temprana de @architect (filesystem local vs data-URL).
- **Cambio en `rubrics`**: columna nullable + enum con default → aditivo, sin backfill destructivo; evaluaciones existentes intactas.
- **Roles**: no tocar `user_role` global → retrocompatibilidad de guards existentes.