# Gap Analysis — Rúbrica de Pádel: Dimensiones Requeridas vs Implementación Actual

> status: proposed
> release: v0.2
> date: 2026-09-21
> change_id: rubric-gap-analysis
> module: db+api+ui
> tags: [rubrics, padel, gap-analysis, db, migration, ui]

## Problema

Verificar si la implementación actual de rúbricas cubre las 6 dimensiones de una rúbrica integral de pádel y los 4 niveles requeridos. Fuentes revisadas: `lib/db/schema.ts`, `lib/validations/padel.ts`, `components/padel/rubric-editor.tsx`, `components/padel/rubric-viewer.tsx`, `components/preview/etapa1-core-evaluativo.tsx`, `production_artifacts/2026-09-20-etapa1-core-evaluativo/feature-spec.md`.

## 1. Dimensiones: Requeridas vs Implementadas

| # | Dimensión requerida | Enum actual (`rubric_category`) | Estado | Notas |
|---|---------------------|--------------------------------|--------|-------|
| 1 | Reglas y conocimiento del juego (puntuación, saque, faltas, posiciones, rotaciones) | — | ❌ **FALTA** | No existe categoría `reglas` ni equivalente |
| 2 | Técnica básica (agarre, golpes de fondo derecha/revés, voleas) | `tecnica` | ⚠️ **PARCIAL** | Cubierta pero mezclada con técnica específica en un solo valor |
| 3 | Técnica específica (bandejas, víboras, remates, globo, salida de pared) | `tecnica` | ⚠️ **PARCIAL** | Cubierta pero mezclada con técnica básica en un solo valor |
| 4 | Táctica y toma de decisiones (elección de golpe, colocación, lectura del rival, construcción del punto, juego en pareja) | `tactica` | ✅ **CUBIERTA** | Coincide 1:1 |
| 5 | Condición física y resistencia (desplazamientos, velocidad de reacción, mantener intensidad) | `fisica` | ✅ **CUBIERTA** | Coincide 1:1 |
| 6 | Actitud, cooperación y trabajo en equipo (comunicación, respeto, esfuerzo, recibir feedback) | `actitud` | ⚠️ **PARCIAL** | Cubre actitud individual; cooperación/trabajo en equipo no está explícito en el nombre ni en la UI |

**Resumen**: 2/6 totalmente cubiertas, 3/6 parciales, 1/6 ausente.

## 2. Niveles: Requeridos vs Implementados

| Nivel requerido | Puntaje | Implementado | Fuente |
|-----------------|---------|--------------|--------|
| Excelente | 4 | ✅ | `LEVEL_NAMES` en rubric-editor.tsx, `LEVELS` en mockup, comentario en schema.ts L450 |
| Bueno | 3 | ✅ | idem |
| Aceptable | 2 | ✅ | idem |
| En desarrollo | 1 | ✅ | idem |

**Resumen**: 4/4 niveles coinciden exactamente. Estructura `rubric_levels` (name, score, sortOrder) soporta la escala. Sin gaps.

## 3. Estructura de Descriptores

| Aspecto | Requerido | Implementado | Estado |
|---------|-----------|--------------|--------|
| Descriptor por (criterio, nivel) | Matriz criterio × nivel | `rubric_descriptors` (criteriaId, levelId, text) + UNIQUE(criteriaId, levelId) | ✅ |
| Exactamente 4 descriptores por criterio | 4 niveles fijos | Zod `.length(4)` en `rubricCreateSchema` + editor con 4 textareas | ✅ |
| Descriptor obligatorio | No vacío | Zod `.min(1)` + validación client en editor | ✅ |
| Niveles fijos (no editables) | Escala fija | Niveles creados por el handler; editor solo edita descriptores | ✅ |

**Resumen**: La estructura de descriptores es correcta y suficiente. Sin gaps estructurales.

## 4. Gaps Específicos Identificados

| ID | Gap | Severidad | Evidencia |
|----|-----|-----------|-----------|
| G1 | **Falta la dimensión "Reglas y conocimiento del juego"** — no hay categoría `reglas` en el enum `rubric_category` (schema.ts L391-393, validations L3) ni en el selector del editor (rubric-editor.tsx L19-24) ni en el mockup | Alta | Enum solo tiene `tecnica, tactica, fisica, actitud` |
| G2 | **`tecnica` mezcla técnica básica y específica** — las dimensiones 2 y 3 requieren separación (agarre/golpes de fondo/voleas vs bandejas/víboras/remates/globo/salida de pared). Un solo valor impide filtrar/reportar por sub-dimensión | Media | Enum `tecnica` único; mockup mezcla Saque+Bandeja+Víbora bajo la misma rúbrica |
| G3 | **`actitud` no expresa cooperación/trabajo en equipo** — la dimensión 6 incluye comunicación, respeto, esfuerzo y recibir feedback; el nombre actual sugiere solo actitud individual | Baja | Nombre del enum + label "Actitud" en editor/mockup |
| G4 | **Sin seed/plantilla de rúbrica integral** — el mockup (CRITERIA L49-90) solo ejemplifica 4 criterios (Saque, Bandeja, Víbora, Posicionamiento) todos de técnica/táctica; no hay ejemplo que cubra reglas, física ni actitud. El editor no guía al coach hacia cobertura de las 6 dimensiones | Media | Mockup CRITERIA; editor sin sugerencias por categoría |
| G5 | **Sin validación de cobertura dimensional** — nada impide crear una rúbrica con 10 criterios de técnica y 0 de reglas/física/actitud; la "rúbrica integral" depende 100% del criterio del coach | Media | `rubricCreateSchema` solo valida título/categoría/criteria genéricos |

## 5. Recomendaciones

| Rec | Acción | Impacto | Prioridad |
|-----|--------|---------|-----------|
| R1 | **Agregar categoría `reglas` al enum** `rubric_category` (DB + Zod + editor + mockup). Migración aditiva vía `db:generate` | DB (enum), validations, UI | Alta |
| R2 | **Evaluar split de `tecnica` en `tecnica_basica` y `tecnica_especifica`** — decisión de producto: si el coach necesita reportar por sub-dimensión, separar; si no, documentar que `tecnica` cubre ambas | DB (enum), UI, queries | Media |
| R3 | **Renombrar o ampliar `actitud` a `actitud_equipo`** (o mantener `actitud` y documentar que incluye cooperación) — mínimo: actualizar label en UI a "Actitud y trabajo en equipo" | UI (label), opcional DB | Baja |
| R4 | **Crear plantilla seed "Rúbrica Integral"** con criterios de las 6 dimensiones (reglas, técnica básica, técnica específica, táctica, física, actitud) para que el coach parta de cobertura completa | Seed + UI (template picker) | Media |
| R5 | **Validación opcional de cobertura**: al publicar una rúbrica marcada como "integral", advertir si faltan dimensiones (soft warning, no bloqueante) | Validations + UI | Baja |

**Nota de alcance**: R1 es el único gap de cumplimiento estricto (dimensión ausente). R2-R5 son mejoras de calidad; R2 y R4 requieren decisión de producto antes de tocar DB.

## Out-of-Scope

- Cambios de esquema sin aprobación de producto (R2/R3/R4/R5).
- Niveles editables (fuera de alcance desde Etapa 1).
- Snapshot de rúbrica al publicar.