# Ponytail Review Report — Editor de Transiciones de Coach

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02
> reviewer: @ponytail-reviewer
> scope: diff completo de la feature (áreas indicadas por el orquestador)
> gates ejecutados: `npx tsc --noEmit` ✅ · `npx eslint` (archivos tocados) ✅ · Jest de los módulos afectados ✅ (105 tests, 6 suites)
> no ejecutado (anti-loop): `next build`, Playwright API/E2E, migraciones.

## 1. Cambios revisados

| Archivo | Antes | Después | Δ |
|---|---:|---:|---:|
| `components/preview/coach-transition-editor.tsx` (mockup efímero) | 1152 | 0 (borrado) | −1152 |
| `hooks/use-transitions.ts` | 182 | 153 | −29 |
| `lib/padel/court/editor.ts` | 181 | 154 | −27 |
| `lib/padel/court/transition.ts` | 95 | 79 | −16 |
| `components/padel/transition-editor/context-bar.tsx` | 185 | 177 | −8 |
| `components/padel/transition-editor/scenario-canvas.tsx` | 93 | 90 | −3 |
| `components/padel/transition-editor/step-filmstrip.tsx` | 182 | 180 | −2 |
| `lib/validations/padel.ts` (bloque transiciones) | 275 | 273 | −2 |
| `components/padel/transition-editor/editor-screen.tsx` | 344 | 344 | 0 (simplificado) |
| **Total** |  |  | **−1239** |

Revisados sin cambios (ya mínimos): `lib/padel/court/history.ts`, `lib/db/queries/padel/transitions.ts`,
`app/api/transitions/route.ts`, `app/api/transitions/[id]/route.ts`, `lib/api-docs/{paths,schemas}/transitions.ts`,
`app/(app)/transiciones/**`, `components/court/EditorStage.tsx`, `components/court/ScenarioPreview.tsx`,
`lib/auth/protected-routes.ts`, `components/layout/app-layout-client.tsx`, `components/padel/teacher-dashboard.tsx`,
`lib/db/schema.ts`.

## 2. Abstracciones eliminadas / simplificadas

1. **`components/preview/coach-transition-editor.tsx` (−1152) — borrado.** Mockup efímero de @ui-designer;
   las reglas del rol lo eliminan al implementarse y era la tarea T15 del `change-map-v2.md`.
   Verificado: **0 referencias** en `app/ components/ lib/ tests/ scripts/` (ruta `/preview/coach-transition-editor`
   fue rechazada en el technical design).
2. **Copias manuales de objetos (−41) — reemplazadas por `structuredClone` (Plataforma Nativa).**
   `editor.ts` tenía `clonePoint` + `cloneStep` (18 líneas de copia campo por campo) → `cloneStep = structuredClone`
   (1 línea, mismo contrato de inmutabilidad que ya validaban los tests: deep-equal + `not.toBe`).
   `transition.ts` perdía `clonePoint` + `clonePositions`; `toCourtScenario` conserva el whitelist
   `{id,label,positions,shot}` (AC-02) pero clona con `structuredClone`.
3. **`nudgeShot` (−8) — borrado de `editor.ts`.** Export sin consumidor (0 usos en `app/`, `components/`, `hooks/`,
   `tests/`): el tiro se dirige arrastrando sus dos manijas (`EditorStage`), no con nudges. No cubría ningún AC.
4. **Client hook: `get` y `remove` (−37) — borrados de `use-transitions.ts`.** 0 consumidores: el detalle se carga
   en el server component (`getTransitionById`) y no hay UI de borrado (el endpoint `DELETE` + sus tests se mantienen,
   son requisito de AC-05). Eran ~37 líneas de fetch muerto enviadas al bundle cliente.
5. **`exitTo` (−2, net 0) — booleano.** `editor-screen` guardaba `exitTo: string | null` para un único destino
   constante; ahora `confirmExit: boolean` + `router.push("/transiciones")`. Elimina estado con falsa generalidad.
6. **Props `className` sin consumidor (−11).** `ContextBar`, `StepFilmstrip` y `ScenarioCanvas` declaraban un
   `className?: string` que nadie pasa (cada uno tiene un solo call site). Se eliminó prop + destructuring + `cn(...)`
   innecesario, y el import de `cn` donde quedaba huérfano.
7. **Superficie pública recortada (−3).** `SHOT_LABEL_MAX`, `STEP_LABEL_MAX`, `RemoveStepResult`,
   `transitionScenarioObjectSchema` y el tipo `TransitionScenarioData` eran `export` sin importadores: ahora son internos.
   `TransitionCreateInput` (type infer sin uso) borrado.

Sin cambios de comportamiento observable: ningún AC-01..AC-06, EC-01..EC-12 ni contrato de API se alteró.

## 3. Beneficio

- **−1239 líneas** de diff (de ellas −1152 son el mockup ya cumplido, −87 código de producción).
- Menos superficie pública en `lib/padel/court/*` → menos API que mantener y menos riesgo de drift.
- Client bundle del editor sin el CRUD muerto (`get`/`remove`): −37 líneas de código cliente.
- `structuredClone` sustituye ~40 líneas de copia manual frágil (cada campo nuevo en `Paso` obligaba a tocar 2 helpers).

## 4. Excepciones justificadas (no se eliminó)

- **`storedScenarioSchema` local en `lib/db/queries/padel/transitions.ts` (28 líneas) se mantiene.** Duplica la forma
  de `transitionScenarioSchema` a propósito: el schema de **lectura** es más laxo (labels sin `trim/min(1)`) para que
  filas antiguas/corruptas no se vuelvan ilegibles (F10 → `null` → 404), y evita acoplar la capa de queries a
  `lib/validations` (sin precedente de ese import en `lib/db/queries/`). Deduplicarlo cambiaría comportamiento de lectura.
- **`CoachTransition` / `NewCoachTransition` (2 líneas, sin uso) se mantienen.** Convención del repo: todas las tablas
  de `schema.ts` exportan sus tipos inferidos; romperla por 2 líneas es peor que la línea muerta.
- **`ShotPatch` declarado 2 veces** (`components/court/EditorStage.tsx` y
  `components/padel/transition-editor/scenario-canvas.tsx`). Se deja: unificarlo exige un import cruzado entre la
  puerta `dynamic({ssr:false})` y el stage Konva (ciclo conceptual) para ahorrar 1 línea de un tipo de 1 campo.
  Riesgo de drift real ≈ 0 (mismos 2 campos opcionales, cubiertos por `EditorStageProps`).
- **`components/padel/transition-editor/*` no se fusionan.** Los 6 componentes tienen un solo consumidor pero separan
  responsabilidades reales (medición del canvas, stage Konva aislado, barra contextual, filmstrip, lista, puente cliente).
  Consolidarlos produciría un archivo de ~700 líneas; peor para el gate `max-lines` y para la regla D-T4 (Konva sólo
  detrás de `dynamic`).
- **Archivos >500 líneas**: ninguno nuevo. `editor-screen` 344, `EditorStage` 297, `transition-library` 142,
  `step-filmstrip` 180, `context-bar` 177 → todos bajo el umbral. (`CourtStage` 528 y `CourtLayers` 394 son del motor,
  fuera de alcance y prohibidos de tocar por instrucción.) El único >500 era el mockup, ahora borrado.
- **Sin líneas muertas restantes detectadas**: se verificó con búsqueda de identificadores que todos los `export`
  restantes de `court/*`, `transitions.ts`, `hooks/use-transitions.ts` y `lib/validations/padel.ts` tienen ≥1 consumidor.

## 5. Observación fuera de alcance (no tocada)

`components/padel/history-list.tsx` aparece en `git status` con un cambio que **no pertenece a esta feature**:
se eliminó el comentario `// eslint-disable-next-line react-hooks/exhaustive-deps` y quedó una línea en blanco con
espacios. ESLint pasa (`exit=0`), pero es ruido de diff ajeno al editor de transiciones; el orquestador debería decidir
si se revierte antes del commit o se justifica como fix de lint previo.

## 6. Verificación

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre `lib/padel/court`, `lib/validations/padel.ts`, `hooks/use-transitions.ts`,
  `components/padel/transition-editor`, `components/court/{ScenarioPreview,EditorStage}.tsx` → 0 errores/warnings.
- `npx jest` (transition-editor, transition-history, transition-serialization, transition-schemas,
  court-geometry, transitions-queries) → **6 suites / 105 tests OK**.
- Specs de tests **no modificados**; `CourtStage`/`CourtParts`/`CourtLayers` **no tocados**.
- Sin dependencias nuevas en `package.json`.
