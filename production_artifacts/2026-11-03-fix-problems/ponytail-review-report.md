# Ponytail Review Report — `2026-11-03-fix-problems`

> owner: @ponytail-reviewer · date: 2026-11-03 · insumos: `git status --short`, `git diff`, `design-exploration.md`, `design-approved.md`, `repair-plan.md`
> Alcance revisado: los 10 archivos de producción + 5 de test del fix (excluyendo `production_artifacts/`).
> No se ejecutó `next build` ni Playwright (regla del encargo). Sí `eslint` sobre los archivos tocados y `tsc --noEmit` (ambos verdes).

---

## 1. Archivos revisados (líneas post-fix)

| Archivo | L | Veredicto |
|---|---|---|
| `components/layout/app-layout-client.tsx` | 99 | **Mantener tal cual** (ver §3.1) |
| `lib/constants/navigation.ts` | 33 | **Mantener** (`canShowTransitionFab` se usa + se testea) |
| `components/padel/teacher-dashboard.tsx` | — | **Mantener** (1 string, D3) |
| `lib/padel/court/flow.ts` | 53 | **Mantener** (`deriveFlowStep` se usa + se testea). Excepción: `FLOW_STEP_COUNT` (§5.1) |
| `components/padel/transition-editor/flow-strip.tsx` | 83 | **Mantener** (presentacional, 0 estado) |
| `components/padel/transition-editor/editor-screen.tsx` | 354 | **Mantener** (sólo +10 L: montar el strip) |
| `components/padel/transition-editor/context-bar.tsx` | 234 | **Simplificado** (§2.1, §2.4) |
| `components/padel/transition-editor/step-filmstrip.tsx` | 186 | **Simplificado** (§2.2, §2.3) |
| `components/padel/transition-editor/scenario-canvas.tsx` | 105 | **Mantener** (ternario de 3 ramas es el mínimo legible) |
| `components/court/EditorStage.tsx` | 304 | **Mantener** (sólo anillo visual; motor/hit-testing intactos) |
| `tests/unit/padel/{transition-fab-visibility,transition-flow}.test.ts` | 48 / 113 | No se tocan (specs) |
| `tests/e2e/{transition-fab,transition-editor}.spec.ts` | 136 / +44 | No se tocan (specs) |
| `app/preview/coach-transition-editor/page.tsx` | 5 | **Mantener** (patrón idéntico a `etapa1/etapa3/etapa4`) |
| `components/preview/coach-transition-editor.tsx` | 660 | **No se refactoriza**: efímero, pendiente de borrado (§5.2, §5.3) |

---

## 2. Refactorizaciones aplicadas (3 borrados, 0 añadidos)

### 2.1 `context-bar.tsx` — spacer vacío → utilidad nativa
```diff
-        <span className="min-w-0 flex-1" aria-hidden />
         <Button
           variant="outline"
-          className="h-11 px-2"
+          className="ml-auto h-11 px-2"
```
Un `<span aria-hidden>` que sólo existía para empujar botones a la derecha (era el antiguo texto "sin guardar"). `ml-auto` hace lo mismo sin nodo extra. Geometría idéntica: mismo `gap-1.5`, mismos `h-11`, sin `flex-shrink` que dependiera del spacer. **−1 línea, −1 nodo DOM.**

### 2.2 `context-bar.tsx` — exports sin consumidor
`PREVIEW_HINT_ID` / `SAVE_HINT_ID` no se importan en ningún archivo (los E2E usan el literal `#transition-preview-hint`). Se quita `export` (siguen documentados con el comentario de por qué existen). **−2 exports de API pública.**

### 2.3 `step-filmstrip.tsx` — indicador de estado duplicado (D4)
```diff
-            {dirty && <span className="text-foreground"> · sin guardar</span>}
```
El `Badge ● Cambios sin guardar` del `ContextBar` (siempre visible, sticky) es ahora la fuente única de ese estado; el filmstrip repetía el mismo dato con otra tipografía. El `dirty` **sigue usándose** (punto en el chip activo, L121) y el nombre accesible/locators no cambian. **−1 línea, −1 duplicación de estado.**

### 2.4 `step-filmstrip.tsx` — `title` que repetía el `aria-label`
```diff
-            title="Añadir paso"
```
`title` con el mismo string que `aria-label` + texto visible en `md+`: tooltip redundante e inútil en móvil (sin hover). Los `title` de "Antes/Después" y del estado vacío **se conservan** (sí añaden información). E2E sigue resolviendo `getByRole("button", { name: "Añadir paso", exact: true })` por `aria-label`. **−1 línea.**

---

## 3. Refactorizaciones evaluadas y **rechazadas** (con motivo)

### 3.1 `useSyncExternalStore` del punto de novedad → no se toca
El plumbing (`getSnapshot`/`getServerSnapshot`/`subscribe`, 18 L) parece candidato a YAGNI, pero es la **API nativa de React** para leer un store externo con `getServerSnapshot` (0 mismatch de hidratación, que era el riesgo A del plan). La alternativa (effect + `setState`) exige `// eslint-disable-next-line react-hooks/set-state-in-effect` (el plugin v7 lo prohíbe; ya hay 2 disables en `push-soft-prompt.tsx`) — cambia deuda de lint por líneas. **Peldaño "Plataforma Nativa" ⇒ se mantiene.** El `subscribe` a `storage` (3 L) aporta sync entre pestañas real; se conserva.

### 3.2 `deriveFlowStep` y `canShowTransitionFab` → se mantienen
Ambos son funciones puras de 4-6 L efectivas con un solo consumidor cada una; su valor no es DRY sino **testeabilidad** (`transition-flow.test.ts` 100%, cobertura del gate `--coverage`) y el contrato aprobado en `repair-plan.md` §4. Inlinearlas movería lógica a componentes cliente → tests de UI en vez de unit. Sin abstracción añadida: no hay clase, factory ni contexto.

### 3.3 Otros candidatos descartados por riesgo > beneficio
- `scenario-canvas.tsx`: ternario anidado de 3 hints → función con `if`s sería igual de largo y añade un nombre. Se queda inline.
- `flow-strip.tsx`: clases sticky repetidas en las 2 ramas (colapsado/expandido) → hoistear un const ahorra 0 líneas netas.
- `app-layout-client.tsx`: `!focusMode && canShowTransitionFab(...)` solapa para `/transiciones/*`; quitar uno de los dos obligaría a editar el unit del helper o perder defensa de llamada directa. Se deja (redundancia segura, no divergente).

---

## 4. Net de líneas

| Concepto | Δ |
|---|---|
| Refactor de esta revisión (2 archivos) | **−3 líneas, +0** (−4 instrucciones/props, +1 clase) |
| Fix completo `components/` + `lib/` (8 archivos modificados) | +186 / −16 |
| Archivos nuevos de producción (`flow.ts` 53 + `flow-strip.tsx` 83) | +136 |
| Tests nuevos (unit 161 + e2e fab 136 + e2e editor +44) | +341 |
| **Balance producción (código nuevo de UI)** | **+322** para 5 decisiones aprobadas (D1–D6) |

Beneficio del refactor: un dato de estado con **una sola fuente visual**, un nodo DOM y dos exports menos; cero cambio de comportamiento observable (mismos nombres accesibles, mismos locators, mismos textos asertados por E2E).

---

## 5. Excepciones documentadas

### 5.1 `FLOW_STEP_COUNT` (1 línea) sin consumo en producción
Sólo lo usa `tests/unit/padel/transition-flow.test.ts` (assert de rango 1..5); `flow-strip.tsx` usa `FLOW_STEPS.length` (fuente real). Borrarlo exigiría editar el spec (prohibido por el encargo). **Aceptado:** es el contrato numérico del flujo y está cubierto.

### 5.2 `components/preview/coach-transition-editor.tsx` supera `max-lines`
660 L totales / **605 no-vacías** (warning `max-lines`). Precedente idéntico en el repo: `etapa3-dashboard-management.tsx` 842 L, `etapa1-core-evaluativo.tsx` 647 L. Es un **mockup efímero aprobado** (D "Mockup") que además mezcla 5 pantallas; dividirlo sería trabajo desechable. **Excepción aceptada, no se refactoriza.**

### 5.3 Pendiente del orquestador (no lo ejecuta esta revisión)
`design-exploration.md` §4 y `design-approved.md` §4: *"El mockup se elimina al cerrar la implementación"*. **Sigue presente** (`app/preview/coach-transition-editor/` + `components/preview/coach-transition-editor.tsx`). **Acción del orquestador al cierre:** borrar ambos + `production_artifacts/.../mockup-spec.md` queda como evidencia histórica. **No se borra aquí** (instrucción explícita del encargo).
Verificación de cierre adicional: `grep -rn "coach-transition-editor" app components` debe devolver 0 tras el borrado.

---

## 6. Gates pasados en esta revisión

| Gate | Resultado |
|---|---|
| `npx eslint` (los 2 archivos refactorizados) | **0 errores, 0 warnings** |
| `npx eslint` (mockup + ruta preview) | 0 errores, 1 warning `max-lines` (precedente, §5.2) |
| `npx tsc --noEmit` | **0 errores** |
| Dependencias nuevas | **0** (no se tocó `package.json`) |
| Criterios de aceptación | **Sin cambios** (D1–D6 intactos; `*_NAV_ITEMS`, `CourtStage`/motor y specs no se tocaron) |
| Build / Playwright | **No ejecutados** (por encargo; los corre @qa-release) |
