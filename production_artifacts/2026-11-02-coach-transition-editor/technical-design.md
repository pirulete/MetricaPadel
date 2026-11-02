# Technical Design — Editor de Transiciones (coach/ADMIN)

> change_id: 2026-11-02-coach-transition-editor
> status: approved-for-implementation
> date: 2026-11-02
> module: padel
> owner: @architect
> inputs: `feature-spec.md`, `release-scope.md`, `ui-kit-audit.md`, `design-exploration.md`, `mockup-spec.md`, `design-approved.md`
> **Versioning**: este archivo es `v1` de la iniciativa. Revisiones posteriores → `technical-design-v2.md`, `-v3.md` (nunca se sobrescribe v1). `change-map.md` sigue la misma regla.
> ⚠️ **SUPERSEDED por `technical-design-v2.md`** (2026-11-02, tras Cross-Agent Review F1–F15). Este v1 se conserva como registro histórico.

---

## 0. Resumen ejecutivo

Se añade **una tabla** (`coach_transitions`, escenario serializable en JSONB), **5 endpoints** CRUD bajo `/api/transitions` (guard `guardAdmin`, auditoría, anti-IDOR 404) y **una ruta de editor ADMIN** mobile-first que reutiliza el motor Konva existente mediante un **stage de edición separado** (`EditorStage`) + `CourtStage` intacto para el preview. Sin dependencias nuevas, sin variables de entorno nuevas.

Layout de referencia **obligatorio**: alternativa **C** aprobada (`design-approved.md`) — barra contextual fija bajo el canvas + filmstrip colapsable + rail vertical en `md+`.

---

## 1. Decisiones de arquitectura

| ID | Decisión | Justificación |
|----|----------|---------------|
| **D-01** | Tabla `coach_transitions` con `ownerId` FK `users.id` **sin cascade** (`no action`) | Coherente con `rubrics`/`courses`: el borrado de un usuario no puede arrastrar material silenciosamente. |
| **D-02** | La columna `scenario` (JSONB) guarda **sólo el núcleo serializable** `{ initialStepIndex, steps }`; `id`/`title` viven en columnas | Evita duplicar `title` en dos sitios (drift). `toCourtScenario(row)` (4 líneas puras, testeado) reconstruye el `CourtScenario` completo → AC-02 sin transformaciones ad hoc. |
| **D-03** | `scenario` **sin `$type<>()`** en `schema.ts`; el tipado vive en `lib/db/queries/padel/transitions.ts` | `lib/db/schema.ts` no importa dominio (`lib/padel/court`) — misma regla que `courses.days`. |
| **D-04** | **Hard delete** (sin `archivedAt`) | La transición es material de clase recreable, ninguna FK la referencia y `audit_logs` conserva el rastro del borrado. |
| **D-05** | **Sin columna `version`** → EC-12 = **last-write-wins** con `updatedAt` | El recurso es de un único owner (no colaboración, out-of-scope); el único conflicto posible es auto-conflicto entre pestañas propias; un `409` exigiría merge-UI sin caso de negocio. `updatedAt` se devuelve en cada respuesta para diagnóstico. |
| **D-06** | `PUT /api/transitions/[id]` = **reemplazo completo** (mismo body que `POST`) | El editor guarda el documento entero (undo/redo es client-side). Un PATCH parcial sobre `steps`/`initialStepIndex` obligaría a refines cruzados sin beneficio. |
| **D-07** | `EditorStage` **componente nuevo** dentro de `components/court/` en lugar de parametrizar `CourtStage` | `CourtStage` es `listening={false}` + reloj rAF + retracción: su contrato es reproducción. Parametrizarlo con `interactive` metería `useState`/drag en el mismo componente que el motor (riesgo de romper AC-03/E1). Separado: reutiliza `CourtLayers`/`CourtParts`/`buildShotView`, cero cambios en `CourtStage`. Ambos entran por `dynamic({ ssr:false })` (D-T4). |
| **D-08** | Undo/redo = **reducer puro sobre snapshots** del escenario (no comandos inversos) | Snapshots de `{initialStepIndex, steps}` son inmutables y pequeños (≤50 pasos); un sistema de comandos inversos añade superficie y bugs. Límite 50 entradas. |
| **D-09** | `touch-action: none` **sólo** en el contenedor del canvas del editor | EC-04: el drag no secuestra el scroll del resto de la página (filmstrip/barra siguen scrolleando normal). |
| **D-10** | El preview reutiliza `CourtStage` vía un wrapper mínimo `ScenarioPreview` (índice de paso + Probar/Detener) | La animación (rAF, easing, retracción, `resolveHitter`) queda **exclusivamente** en `CourtStage`. No se toca `PuzzleDemo` (spike marcado como borrable; tocarlo sería deuda). |
| **D-11** | Guard de **página** = `validateAdmin()`; guard de **API** = `guardAdmin()` → 403 | Convención del repo para páginas privadas (`/rubricas`, `/cursos`): USER es redirigido a `/dashboard`; el 403 duro de AC-09 se satisface en la capa API (frontera real de datos) y se verifica con E2E de redirección + llamada API directa 403. `LOCKED` nunca entra (login). |
| **D-12** | Sin `lib/audit/helpers.ts` nuevo: se reutilizan `auditCreate`/`auditUpdate`/`auditDelete` con `entityName = "coach_transition"` | Los eventos CREATED/UPDATED/DELETED ya existen genéricos; añadir wrappers de dominio sería boilerplate. |

---

## 2. DB — `coach_transitions`

### 2.1 Esquema (aditivo, en `lib/db/schema.ts`)

```ts
export const coachTransitions = pgTable("coach_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  title: varchar("title", { length: 200 }).notNull(),
  scenario: jsonb("scenario").notNull(), // { initialStepIndex: number, steps: Paso[] }
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("coach_transitions_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);
```

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `defaultRandom()` |
| `owner_id` | uuid NOT NULL | FK `users.id` (no cascade) |
| `title` | varchar(200) NOT NULL | obligatorio también en DB (EC-07/EC-08 se validan antes con Zod) |
| `scenario` | jsonb NOT NULL | `{ initialStepIndex, steps }`, validado por Zod en la frontera |
| `created_at` / `updated_at` | timestamps | `updated_at` lo setea la query en cada PUT (cursor de paginación) |

**Índice**: `coach_transitions_owner_updated_idx (owner_id, updated_at)` — cubre `WHERE owner_id = ? ORDER BY updated_at DESC` (listado + cursor G15).

### 2.2 Migración (obligatoria, sin SQL a mano)

1. `pnpm run db:generate` → genera `drizzle/0012_*.sql` + snapshot.
2. Revisar `drizzle/meta/_journal.json` (debe aparecer `idx: 12`, orden cronológico intacto). **No editar a mano.**
3. `pnpm run db:migrate`.
4. Verificar columnas:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'coach_transitions' ORDER BY ordinal_position;
   ```
5. Verificar índice: `SELECT indexname FROM pg_indexes WHERE tablename = 'coach_transitions';`

---

## 3. Contratos API (contract-first)

Route handlers en `app/api/transitions/`, `runtime = "nodejs"`, patrón idéntico a `app/api/rubrics/*`.
Zod en `lib/validations/padel.ts` (patrón existente). Documentación en `lib/api-docs/paths/transitions.ts` + `lib/api-docs/schemas/transitions.ts` (submódulos, para no inflar `spec.ts`).

### 3.1 Tipos de transporte

```ts
type TransitionPointDto = { x: number; y: number }            // metros, X∈[0,10], Y∈[0,20]
type TransitionShotDto  = { control: TransitionPointDto; to: TransitionPointDto; label: string } | null
type TransitionStepDto  = { id: number; label: string; positions: Record<"A"|"B"|"C"|"D", TransitionPointDto>; shot: TransitionShotDto }
type TransitionDto      = { id: string; title: string; initialStepIndex: number; steps: TransitionStepDto[]; createdAt: string; updatedAt: string } // ISO
type TransitionSummary  = { id: string; title: string; stepCount: number; updatedAt: string; createdAt: string }
```

### 3.2 Endpoints

| Endpoint | Auth / Guard | Request | Response OK | Errores | Auditoría |
|---|---|---|---|---|---|
| `GET /api/transitions` | `guardAdmin` | query `?limit=1..50&cursor=<ISO>` | `200 { items: TransitionSummary[], nextCursor: string \| null }` | `400` query inválida · `401` · `403` | — |
| `POST /api/transitions` | `guardAdmin` | `{ title, initialStepIndex, steps }` | `201 { transition: TransitionDto }` | `400` Zod · `401` · `403` | `auditCreate("coach_transition", id, { title, stepCount })` |
| `GET /api/transitions/[id]` | `guardAdmin` | path `id` uuid | `200 { transition: TransitionDto }` | `400` uuid inválido · `401` · `403` · **`404`** (inexistente o ajeno) | — |
| `PUT /api/transitions/[id]` | `guardAdmin` | `{ title, initialStepIndex, steps }` (reemplazo completo) | `200 { transition: TransitionDto }` | `400` · `401` · `403` · **`404`** | `auditUpdate("coach_transition", id, {title, stepCount}old, {title, stepCount}new)` |
| `DELETE /api/transitions/[id]` | `guardAdmin` | path `id` uuid | `200 { deleted: true, id }` | `400` · `401` · `403` · **`404`** | `auditDelete("coach_transition", id, { title, stepCount })` |

Reglas transversales:
- **Anti-IDOR**: toda query recibe `ownerId` de sesión y filtra `and(eq(id), eq(ownerId))`. Recurso ajeno o inexistente → **404** (nunca 403; no filtra existencia) → EC-06.
- **Ownership en escritura**: `update`/`delete` usan `.where(and(...)).returning()`; resultado vacío → `404`. Cero ventana TOCTOU.
- **Retrocompatibilidad**: endpoints nuevos, ningún contrato existente cambia. Sin breaking changes.
- **Paginación G15**: cursor = `updatedAt` ISO; `orderBy(desc(updatedAt))`; `limit+1` → `hasMore`; `resolveLimit` (default 20, máx 50). El campo del cursor coincide con el `orderBy`.
- **Listado sin payload pesado**: `stepCount` se calcula en SQL (`jsonb_array_length(scenario->'steps')`), no se devuelve `scenario` en la lista.

### 3.3 Zod (`lib/validations/padel.ts`, +~55 líneas)

```ts
const transitionPointSchema = z.object({ x: z.number().min(0).max(COURT_WIDTH_M), y: z.number().min(0).max(COURT_DEPTH_M) });
const transitionShotSchema  = z.object({ control: transitionPointSchema, to: transitionPointSchema, label: z.string().trim().min(1).max(40) }).nullable();
const transitionStepSchema  = z.object({ id: z.number().int().min(1), label: z.string().trim().min(1).max(200),
  positions: z.object({ A: transitionPointSchema, B: transitionPointSchema, C: transitionPointSchema, D: transitionPointSchema }), shot: transitionShotSchema });
export const transitionScenarioSchema = z.object({ initialStepIndex: z.number().int().min(0), steps: z.array(transitionStepSchema).min(1, "mínimo 1 paso").max(50) })
  .refine((v) => v.initialStepIndex < v.steps.length, { message: "initialStepIndex fuera de rango" });
export const transitionCreateSchema = transitionScenarioSchema.extend({ title: z.string().trim().min(1, "title es requerido").max(200) }); // PUT reutiliza este schema (D-06)
export const transitionListQuerySchema = paginationQuerySchema;
export const padelIdParamsSchema // reutilizado para [id]
```
`transitionPointSchema` importa `COURT_WIDTH_M`/`COURT_DEPTH_M` de `lib/padel/court/types` (módulo puro) en vez de duplicar `10/20`.

### 3.4 Registro en `lib/auth/protected-routes.ts`

5 entradas nuevas bajo `// ─── PADEL EVALUATIVO — Transiciones (coach/ADMIN) ───`: `guard: 'guardAdmin'`, `allowedStatuses: ['ACTIVE']`, `roles: ['ADMIN']`, `description` + `audit` en las 3 mutaciones. `LOCKED` nunca listado.

### 3.5 `lib/api-docs/spec.ts`

Añadir import + tag `padelTransitionsTags`, spread en `tags`, `paths` y `components.schemas`. Ningún path existente se modifica.

---

## 4. UI / rutas

| Ruta | Archivo | Guard | Estado |
|---|---|---|---|
| `/transiciones` | `app/(app)/transiciones/page.tsx` (server) | `validateAdmin()` | ADMIN+ACTIVE; USER → `/dashboard`; TEMPORARY/SIN SESIÓN/LOCKED → login vía `validateUser` del layout |
| `/transiciones/nueva` | `app/(app)/transiciones/nueva/page.tsx` (server) | `validateAdmin()` | idem; escenario en blanco en memoria, POST al guardar |
| `/transiciones/[id]` | `app/(app)/transiciones/[id]/page.tsx` (server) | `validateAdmin()` | idem; GET al montar, 404 → `notFound()` |
| `/preview/coach-transition-editor` | `app/preview/coach-transition-editor/page.tsx` (4 líneas) | — (efímera) | Se crea en implementación y se **borra junto al mockup** en el cleanup |

Layout: `max-w-md` en móvil → `md:max-w-3xl` con `md:grid-cols-[minmax(0,1fr)_190px]` (canvas + rail de pasos), filmstrip horizontal `md:hidden`, barra contextual fija bajo el canvas (alternativa C, `design-approved.md`).
Estados obligatorios (mockup §3): default, sin selección, lista vacía, undo/redo vacío, loading preview, error de guardado, guardado OK, borrar último paso bloqueado (EC-05), cambios sin guardar (EC-11).
Tokens: sólo CSS variables + `COURT_COLORS`; targets ≥44 px (`size-11`).

---

## 5. Editor — arquitectura técnica

### 5.1 Componentes (todos client, Konva sólo por `dynamic({ssr:false})`)

| Archivo | Responsabilidad | Reutiliza |
|---|---|---|
| `components/court/EditorStage.tsx` (**nuevo**, default export) | Stage **interactivo**: dibuja el paso, permite tap-select y drag de jugadores/pelota/control de arco | `buildFloor`, `buildCourtLines`, `buildNet`, `buildWallPosts`, `buildPlayerFigures`, `buildShotView`, `COURT_COLORS`, `PlayerFigure`, `Bubble`, `Net`, `courtToPx`/`pxToCourt` |
| `components/court/ScenarioPreview.tsx` (**nuevo**) | Botón Probar: índice de paso + `setTimeout(TWEEN_MS)` y monta `CourtStage` | `CourtStage` (dynamic), `useCourtConfig`, `clampStepIndex` |
| `components/padel/transition-editor/scenario-canvas.tsx` | Wrapper medido (`useCourtConfig`), `touch-action:none` **local**, `dynamic(EditorStage)` | `useCourtConfig` |
| `components/padel/transition-editor/context-bar.tsx` | Nudges ±0.5 m, fijar/quitar tiro; disabled sin selección | `Button`, `Separator` |
| `components/padel/transition-editor/step-filmstrip.tsx` | Miniaturas, añadir/duplicar/borrar/reordenar, colapsable | `Button`, `Badge`, `EmptyState` |
| `components/padel/transition-editor/editor-screen.tsx` | Orquesta estado (`useReducer`), historial, guardado, preview, EC-05/EC-11 | `history.ts`, `editor.ts`, `use-transitions` |
| `components/padel/transition-editor/transition-library.tsx` | Lista + CTA + empty/loading/error | `Card`, `EmptyState`, `Badge` |

`EditorStage` props:
```ts
type EditorStageProps = {
  step: Paso;
  selected: PlayerId | "ball" | null;
  viewport: CourtViewport;
  onSelect: (target: PlayerId | "ball" | null) => void;
  onMovePlayer: (id: PlayerId, point: CourtPoint) => void;          // metros, ya clampeado
  onMoveShot: (patch: { control?: CourtPoint; to?: CourtPoint }) => void;
};
```
Implementación: `Stage listening` (no `pointerEvents:none`), capa 1-3 de sólo lectura, `Group draggable` por jugador con hit-area invisible (radio `0.55 m * scale`, target ≥44 px), `dragBoundFunc` que clampa los px al rect de cancha, `onDragEnd` → `pxToCourt(..., viewport)`. Manija de arco = `Circle` sobre `to` (mueve destino) y sobre el mid de control (dirige el arco). `onSelect(null)` en tap del fondo. **No** se importa `CourtStage` aquí (evita duplicar el reloj rAF).

### 5.2 Lógica pura nueva (testeable en Jest, `testEnvironment: node`)

| Archivo | API | Notas |
|---|---|---|
| `lib/padel/court/geometry.ts` (+25) | `pxToCourt(point, viewport): CourtPoint`, `clampCourtPoint(point): CourtPoint` | Inversa exacta de `courtToPx` (usa `computeScale`/`computeOffsets`); viewport degenerado (escala 0) → `{0,0}` sin NaN; clamp a 0..10 / 0..20 (EC-10) |
| `lib/padel/court/history.ts` (nuevo, ~70) | `History<T>`, `createHistory`, `commit`, `undo`, `redo`, `canUndo`, `canRedo`, `HISTORY_LIMIT = 50` | Reducer funcional sin React; `undo`/`redo` sobre vacío → devuelve el mismo objeto (no-op EC-01) |
| `lib/padel/court/editor.ts` (nuevo, ~150) | `movePlayer`, `moveShotTo`, `moveShotControl`, `nudgePlayer`/`nudgeShot(±0.5)`, `setShotFrom`, `clearShot`, `addStep`, `duplicateStep`, `removeStep` (`{ok:false, reason:"last_step"}`), `reorderSteps` | Snapshots inmutables; todo clampea con `clampCourtPoint` |
| `lib/padel/court/transition.ts` (nuevo, ~50) | `TransitionScenarioData`, `toCourtScenario(row)`, `emptyTransitionDoc()`, `nextStepId(steps)` | AC-02 round-trip; sin imports server-only |

### 5.3 Conflicto de gestos (EC-04)

- El `touch-action: none` vive **sólo** en el `div` que envuelve el Stage (clase `touch-none` + `style={{ touchAction: "none" }}`), nunca en `body`/página.
- El Stage mantiene `listening` para que Konva capture `pointerdown`; los nodos arrastrables llaman `evt.cancelBubble` y el ARNÉS llama `preventDefault()` en `dragstart`.
- Fuera del canvas (filmstrip, barra contextual, top bar) el scroll táctil es normal.

---

## 6. Preview "Probar"

`ScenarioPreview` mantiene `index` + `playing`; en cada tick (`TWEEN_MS = 1000`, exportado como constante local) avanza con `clampStepIndex`; `originPositions` = `steps[index-1]?.positions ?? steps[index].positions` (idéntico a `PuzzleDemo`); botón alterna Probar/Detener. **Cero** reimplementación de rAF, easing, `resolveHitter` o retracción. `StepFilmstrip` no interviene.

---

## 7. Impacto por capa

| Capa | Impacto |
|---|---|
| **auth** | Sin cambios en `auth.ts`/JWT. Nuevas entradas en `protected-routes.ts`; `guardAdmin` en 5 endpoints; páginas con `validateAdmin`. Sin nuevos estados/roles. |
| **db** | 1 tabla nueva + 1 índice + 1 migración generada. Cero cambios en tablas existentes. |
| **api** | 5 endpoints nuevos (2 route handlers), 1 tag/paths/schemas en api-docs. Sin breaking changes. |
| **ui** | 3 rutas nuevas + 1 preview efímera; 2 componentes en `components/court/`, 4 en `components/padel/transition-editor/`, 1 hook. `CourtStage`/`PuzzleDemo` **sin tocar**. |
| **tests** | 5 unit nuevos (+1 extendido), 2 API (guard + happy con SQL real), 1 E2E. |
| **env** | **Ninguna variable nueva.** `.env.example` no se modifica. |
| **docs** | `ARCHITECTURE.md` (tabla + endpoints + rutas), `FEATURES.md` (@pm/@qa-release), `lib/api-docs/spec.ts`. |

---

## 8. Agentes y orden de ejecución

1. **@db-engineer** — schema + `pnpm run db:generate` + `db:migrate` + verificación de columnas + `queries/padel/transitions.ts` (+ re-export en `index.ts`) + unit test de queries.
2. **@auth-security** — entradas en `protected-routes.ts`, revisión de `guardAdmin`/auditoría en handlers (con @app-engineer), `transitions-guard.spec.ts` (`401`/`403`/`404` IDOR), `auth-impact.md` + `security-checklist.md`.
3. **@app-engineer** — Zod, lógica pura (`geometry`/`history`/`editor`/`transition`), route handlers, api-docs, `EditorStage`/`ScenarioPreview`, editor UI, hook, páginas, tests unit/API happy + E2E spec. Se invoca en **8 sub-tasks ≤5 archivos** (ver `change-map.md`).
4. **@ponytail-reviewer** — diff mínimo antes de QA (riesgo declarado en `feature-spec.md` §6).
5. **@qa-release** — regresión, gates, cobertura, `FEATURES.md`, `evidence-manifest.json`.

> ⚠️ **Cross-Agent Review activado**: el change-map supera 5 archivos y añade contratos API nuevos → en el paso 5 del workflow, @app-engineer valida viabilidad del diseño; si hay observaciones → `design-review.md` → @architect ajusta (`technical-design-v2.md`) → se re-implementa antes de QA.

---

## 9. Plan de tests mapeado a AC

| Test | Tipo | AC / EC |
|---|---|---|
| `tests/unit/padel/transition-schemas.test.ts` — válido, título vacío, 0 pasos, coords fuera de rango, `initialStepIndex` inválido, `shot:null` | Unit | AC-05, EC-03, EC-07, EC-08, EC-10 |
| `tests/unit/padel/court-geometry.test.ts` (**extender**) — `pxToCourt` inversa de `courtToPx`, centro/esquinas, viewport 0×0, clamp | Unit | AC-06, EC-10 |
| `tests/unit/padel/transition-history.test.ts` — commit/undo/redo, no-op en vacío (EC-01), límite 50 | Unit | AC-06, EC-01 |
| `tests/unit/padel/transition-editor.test.ts` — mover/nudge/clamp, añadir/duplicar/reordenar, borrar último (EC-05), `setShotFrom`/`clearShot` | Unit | AC-06, EC-02, EC-05, EC-10 |
| `tests/unit/padel/transition-serialization.test.ts` — round-trip `doc ↔ JSON ↔ CourtScenario` | Unit | **AC-02** |
| `tests/unit/db/transitions-queries.test.ts` — list/create/get/update/delete con `ownerId` (mocks) | Unit | AC-05 |
| `tests/api/padel/transitions-guard.spec.ts` — `401` sin sesión, `403` USER y TEMPORARY, `200` ADMIN, IDOR `404` en GET/PUT/DELETE | API | **AC-04**, EC-06, EC-09 |
| `tests/api/padel/transitions-happy.spec.ts` — CRUD con **SQL real** (create→get→list→update→delete) + `400` payload inválido | API | **AC-05**, EC-03 |
| `tests/e2e/transition-editor.spec.ts` — 375×667: crear → mover jugador → fijar tiro → añadir paso → undo/redo → Probar → guardar → reabrir; + USER redirigido del editor y `403` en `GET /api/transitions` | E2E | AC-01, AC-03, AC-06, **AC-09**, EC-09 |

Gates: `tsc --noEmit` 0, `eslint` 0, `next build` OK, unit+API+E2E verdes, cobertura `lib/padel/` sin regresión >3%, `--api-docs`, `--env` (sin vars nuevas).

---

## 10. Variables de entorno

**Ninguna nueva.** No se toca `.env.example` ni `.env.local`. Si en implementación apareciera alguna (no previsto), se añade con **Edit puntual** documentada en `.env.example` y en este archivo (`v2`), nunca sobrescribiendo.

---

## 11. Limpieza / rollback

- **Cleanup al cerrar**: borrar `components/preview/coach-transition-editor.tsx` y `app/preview/coach-transition-editor/page.tsx`.
- **Rollback**: la migración es aditiva (1 tabla + 1 índice, sin FKs entrantes) → `DROP TABLE coach_transitions` revierte sin tocar datos existentes. Rutas y componentes nuevos se eliminan sin efectos colaterales.

---

## 12. Changelog

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2026-11-02 | Diseño inicial: 1 tabla, 5 endpoints, `EditorStage` + lógica pura, preview reutilizado, 0 env vars, 8 chunks de implementación. |
