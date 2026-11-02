# Technical Design — Editor de Transiciones (coach/ADMIN) — v2

> change_id: 2026-11-02-coach-transition-editor
> status: approved-for-implementation
> date: 2026-11-02
> module: padel
> owner: @architect
> supersedes: `technical-design.md` (v1) — v1 queda como registro histórico, no se modifica
> inputs: `feature-spec.md`, `release-scope.md`, `ui-kit-audit.md`, `design-exploration.md`, `mockup-spec.md`, `design-approved.md`, **`design-review.md` (F1–F15)**, **`app-notes.md` (T1–T16)**, `auth-impact.md`, `security-checklist.md`
> **Versioning**: v2 según la regla que v1 declara («revisiones posteriores → `technical-design-v2.md`, nunca se sobrescribe v1»). Próximas revisiones → `-v3.md`. `change-map-v2.md` sigue la misma regla.

---

## 0. Resolución del Cross-Agent Review (F1–F15)

**15/15 hallazgos resueltos: 14 aceptados, 1 parcialmente rechazado (F12b: 8.º ítem de nav).** Ningún contrato API cambia respecto de v1. El bloqueante F1 se corrige con un patrón Zod 3 válido (§3.3). El plan de ejecución pasa de 10 chunks (C1–C10) a **16 tasks (T1–T16)**, todas ≤5 archivos y ≤400 líneas est., alineado con `app-notes.md` §3.

| ID | Sev. | Decisión | Resolución concreta en v2 |
|---|---|---|---|
| **F1** | BLOQUEANTE | **ACEPTADO** | §3.3: `transitionScenarioObjectSchema` es el único `ZodObject`; `.extend()` se aplica **antes** de cualquier refine; el refine va al final con `.superRefine()` compartido. Prohibido `.extend()` tras `.refine()`/`.superRefine()`. |
| **F2** | ajuste | **ACEPTADO** | `change-map-v2.md` §2: C4/C5/C6/C8 (546/490/650/460 líneas) se parten en T5–T10 + T12a/T12b. Ninguna task supera 400 líneas. |
| **F3** | ajuste | **ACEPTADO** | El spec de guard se **escribe** en T14 y se **ejecuta** después de T5 (gate real: T14 depende de T5, no de T1/T2). C2 desaparece como chunk con gate propio. |
| **F4** | ajuste | **ACEPTADO** | §3.2 corregida: `auditCreate(entity, id, newValues, ctx)` / `auditUpdate(entity, id, oldValues, newValues, ctx)` (**5 args**) / `auditDelete(entity, id, oldValues, ctx)` — firmas verificadas en `lib/audit/helpers.ts:18-69`. |
| **F5** | ajuste | **ACEPTADO** | §5.1: `Group draggable` externo + `<Rect>` hit-area **hermana** + `PlayerFigure figure={{...figure, x:0, y:0}} groupRef={() => {}}`. `CourtParts.tsx` no se toca. `groupRef` es **obligatorio** en el tipo actual (no opcional) → se pasa no-op. |
| **F6** | ajuste | **ACEPTADO** | §5.1: `hitR = Math.max(22, 0.55 * scale)` → diámetro ≥44 px a cualquier ancho (a 375 px = 22 px de radio = 44 px exactos). |
| **F7** | ajuste | **ACEPTADO** | §5.1/§6: regla única `originPositions = steps[i-1]?.positions ?? steps[i].positions` **en editor y preview**. `Shot` no guarda origen (`types.ts:41-56`). |
| **F8** | ajuste | **ACEPTADO (opción b, simplificada)** | §5.1: `selected: PlayerId \| null` — se **elimina** `"ball"` de la unión (YAGNI: no hay `onMoveBall` y el origen es derivado). El resaltado del `hit` es read-only. |
| **F9** | ajuste | **ACEPTADO** | §5.2: `setShot(step, to?, control?)` reemplaza a `setShotFrom`. Defaults: `to` = `{x:5, y:2}` si el jugador está en el campo norte (`y < NET_Y_M`), espejo `{x:5, y:18}` si está al sur; `control` = punto medio `from→to`; `label = "GOLPE"` (respeta 1..40). |
| **F10** | ajuste | **ACEPTADO** | §3.2/§5.2: `getTransitionById` hace `transitionScenarioSchema.safeParse(row.scenario)`; fallo → `null` → **404** (GET/PUT/DELETE). `listTransitions` no parsea `steps` (usa `stepCount` en SQL). Auditoría de DELETE usa `safeParse` + `?? 0`. |
| **F11** | ajuste | **ACEPTADO** | §3.2: `COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)::int` → `stepCount: number` garantizado. |
| **F12a** (entrada) | ajuste | **ACEPTADO con cambio**: CTA en `/dashboard`, **NO** 8.º ítem de nav | `ADMIN_NAV_ITEMS` ya tiene **7** ítems en un bottom-nav de 375 px (`bottom-nav.tsx:22`, `flex-1` → ~53 px/ítem). Un 8.º deja ~46 px e importa recortar labels ya validados. Se añade CTA en `teacher-dashboard.tsx` (permanente, sin tocar el nav). **Se rechaza** el ítem 8 de `navigation.ts`. |
| **F12b** (modo foco) | ajuste | **ACEPTADO (opción b)** | `app-layout-client.tsx` MOD: `usePathname()` + `FOCUS_MODE_ROUTES` oculta `BottomNav` y el `pb-16` en `/transiciones/nueva` y `/transiciones/[id]`. `/transiciones` (biblioteca) conserva nav. |
| **F13** | ajuste | **ACEPTADO** | E2E hace `page.setViewportSize({width:375,height:667})` + assert `document.documentElement.scrollWidth <= 375`. **No** se modifica `playwright.config.ts` (viewport por spec, no global). |
| **F14** | ajuste | **ACEPTADO** | `transitions-happy.spec.ts` añade 3 `SELECT` a `audit_logs` (`entity_name='coach_transition'`, `action_type` CREATE/UPDATE/DELETE, `user_id`). |
| **F15** | ajuste | **ACEPTADO** | T3 actualiza la cabecera de `lib/padel/court/geometry.ts` (quita «SPIKE NO PRODUCTIVO — borrable»). `types.ts`/`annotation.ts` **no** se tocan (siguen siendo del spike, el editor no los necesita más allá de `types.ts` como import de sólo tipos). |
| **Extra (rechazo)** | — | **RECHAZADO**: crear `app/preview/coach-transition-editor/page.tsx` | No existe hoy, nada lo referencia y el mockup ya está aprobado. Crear una ruta para borrarla 4 tasks después es trabajo muerto. T15 sólo elimina `components/preview/coach-transition-editor.tsx` (verificado: 0 referencias en `app/ components/ lib/ tests/ scripts/`). |

---

## 1. Decisiones de arquitectura

Se mantienen **D-01…D-12** de v1 sin cambios. Nuevas:

| ID | Decisión | Justificación |
|----|----------|---------------|
| **D-13** | **Modo foco**: `app-layout-client.tsx` oculta `BottomNav` (y su `pb-16`) por ruta, vía `usePathname()` | `components/layout/app-layout-client.tsx:23` renderiza `BottomNav` siempre dentro de `(app)`; `design-approved.md` (D5) exige editor a pantalla completa. 2 líneas + 1 constante; no se toca `BottomNav` ni `navigation.ts`. |
| **D-14** | Entrada a la feature = **CTA en `/dashboard`** (coach), no ítem de nav | 7 ítems ya ocupan el bottom-nav de 375 px; el dashboard del coach ya es el hub (`teacher-dashboard.tsx:55-57`). `/transiciones` incluye enlace «Volver al inicio». |
| **D-15** | `scenario` (jsonb) se **valida al leer**, no se confía en la DB | `schema.ts:643` sin `$type<>` (D-03) → `unknown`. `safeParse` en la capa de queries evita 500 en `PUT`/página ante fila corrupta; degradación a 404. |
| **D-16** | Un solo `ZodObject` base + refinamiento compartido al final (§3.3) | Zod 3: `.refine()`/`.superRefine()` devuelven `ZodEffects` sin `.extend()`. Base única + `refineInitialStepIndex` compartido evita drift entre el schema de escenario (lectura DB) y el de creación (API). |

---

## 2. DB — `coach_transitions` (sin cambios respecto de v1)

### 2.1 Esquema (aplicado)

```ts
export const coachTransitions = pgTable("coach_transitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "no action" }),
  title: varchar("title", { length: 200 }).notNull(),
  scenario: jsonb("scenario").notNull(), // { initialStepIndex, steps } — validado con Zod al leer (D-15)
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => [
  index("coach_transitions_owner_updated_idx").on(table.ownerId, table.updatedAt),
]);
```

**Estado**: migración `drizzle/0012_young_betty_ross.sql` + `_journal.json idx 12` **ya aplicada y verificada** (`migration-notes.md`). **No regenerar.** T1 es no-op.

---

## 3. Contratos API (contract-first)

### 3.1 Tipos de transporte (sin cambios respecto de v1)

```ts
type TransitionPointDto = { x: number; y: number }
type TransitionShotDto  = { control: TransitionPointDto; to: TransitionPointDto; label: string } | null
type TransitionStepDto  = { id: number; label: string; positions: Record<"A"|"B"|"C"|"D", TransitionPointDto>; shot: TransitionShotDto }
type TransitionDto      = { id: string; title: string; initialStepIndex: number; steps: TransitionStepDto[]; createdAt: string; updatedAt: string }
type TransitionSummary  = { id: string; title: string; stepCount: number; updatedAt: string; createdAt: string }
```

### 3.2 Endpoints (firmas de auditoría corregidas — F4)

| Endpoint | Guard | Request | Response OK | Errores | Auditoría (firma real) |
|---|---|---|---|---|---|
| `GET /api/transitions` | `guardAdmin` | `?limit=1..50&cursor=<ISO>` | `200 { items: TransitionSummary[], nextCursor }` | `400` · `401` · `403` | — |
| `POST /api/transitions` | `guardAdmin` | `{ title, initialStepIndex, steps }` | `201 { transition }` | `400` · `401` · `403` | `auditCreate("coach_transition", id, { title, stepCount }, ctx)` |
| `GET /api/transitions/[id]` | `guardAdmin` | uuid | `200 { transition }` | `400` · `401` · `403` · **`404`** | — |
| `PUT /api/transitions/[id]` | `guardAdmin` | body completo (D-06) | `200 { transition }` | `400` · `401` · `403` · **`404`** | `auditUpdate("coach_transition", id, { title, stepCount: old }, { title, stepCount: next }, ctx)` — **5 args** |
| `DELETE /api/transitions/[id]` | `guardAdmin` | uuid | `200 { deleted: true, id }` | `400` · `401` · `403` · **`404`** | `auditDelete("coach_transition", id, { title, stepCount }, ctx)` |

Reglas transversales (idénticas a v1, con las correcciones marcadas):

- **Anti-IDOR**: `and(eq(id), eq(ownerId))`; ajeno/inexistente → **404**.
- **Ownership en escritura**: `.returning()` vacío → 404. Sin TOCTOU.
- **Retrocompatibilidad**: endpoints nuevos; ningún contrato existente cambia. Cero breaking changes.
- **Paginación G15**: cursor `updatedAt`, `desc`, `limit+1`, `resolveLimit` (20/50).
- **`stepCount` (F11)**: `sql<number>\`COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)::int\``.
- **(F10) Lectura defensiva**: `getTransitionById` → `safeParse(row.scenario)`; inválido ⇒ `null` ⇒ 404. `listTransitions` no parsea (sólo SQL). `DELETE` audita `stepCount` con `safeParse(...).success ? steps.length : 0`.

### 3.3 Zod — patrón corregido (F1) — `lib/validations/padel.ts` (+~60 líneas)

**Regla dura**: se llama `.extend()` **sólo** sobre un `ZodObject` limpio; todo `.superRefine()` va **al final** de la cadena. Nunca `.extend()` después de un refine (Zod 3.25.76 devuelve `ZodEffects`, que no expone `.extend`).

```ts
import { z } from "zod";
import { COURT_DEPTH_M, COURT_WIDTH_M } from "@/lib/padel/court/types";

const transitionPointSchema = z.object({
  x: z.number().min(0).max(COURT_WIDTH_M),
  y: z.number().min(0).max(COURT_DEPTH_M),
});

const transitionShotSchema = z
  .object({
    control: transitionPointSchema,
    to: transitionPointSchema,
    label: z.string().trim().min(1).max(40),
  })
  .nullable();

const transitionStepSchema = z.object({
  id: z.number().int().min(1),
  label: z.string().trim().min(1).max(200),
  positions: z.object({
    A: transitionPointSchema, B: transitionPointSchema,
    C: transitionPointSchema, D: transitionPointSchema,
  }),
  shot: transitionShotSchema,
});

/** Base única: el ÚNICO ZodObject del que se derivan los dos schemas. */
const transitionScenarioObjectSchema = z.object({
  initialStepIndex: z.number().int().min(0),
  steps: z.array(transitionStepSchema).min(1, "mínimo 1 paso").max(50),
});

/** Refinamiento compartido (evita drift entre lectura DB y API). */
const refineInitialStepIndex = (
  value: { initialStepIndex: number; steps: unknown[] },
  ctx: z.RefinementCtx,
) => {
  if (value.initialStepIndex >= value.steps.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["initialStepIndex"],
      message: "initialStepIndex fuera de rango",
    });
  }
};

/** Escenario puro — usado por `safeParse(row.scenario)` al leer de DB (F10). */
export const transitionScenarioSchema =
  transitionScenarioObjectSchema.superRefine(refineInitialStepIndex);

/** Body de POST y PUT (D-06): extend PRIMERO, refine AL FINAL. */
export const transitionCreateSchema = transitionScenarioObjectSchema
  .extend({ title: z.string().trim().min(1, "title es requerido").max(200) })
  .superRefine(refineInitialStepIndex);

export const transitionListQuerySchema = paginationQuerySchema;
// padelIdParamsSchema se reutiliza tal cual para [id]
```

Notas de implementación:
- `z.RefinementCtx` y `z.ZodIssueCode.custom` existen en Zod 3.25.76 (no usar `ctx.addIssue({ message })` sin `code`: TS lo rechaza).
- `path: ["initialStepIndex"]` es obligatorio para que el 400 del handler señale el campo (mensaje útil en UI/E2E).
- `z.infer<typeof transitionCreateSchema>` sigue dando `{ initialStepIndex, steps, title }`; el tipo no cambia respecto de v1 → contrato intacto.
- Test (T12a) debe cubrir explícitamente el caso que rompía v1: **parsear un body con `title` válido** (si `.extend` estuviera mal encadenado, el schema no compilaría) + `initialStepIndex === steps.length` → issue con `path[0] === "initialStepIndex"`.

### 3.4 `lib/auth/protected-routes.ts` — sin cambios respecto de v1

5 entradas, `guard: 'guardAdmin'`, `allowedStatuses: ['ACTIVE']`, `roles: ['ADMIN']`, `audit` en las 3 mutaciones. `LOCKED` nunca listado.

### 3.5 `lib/api-docs/spec.ts` — sin cambios respecto de v1

Import + tag `padelTransitionsTags`, spread en `tags`/`paths`/`components.schemas`. `401/403/404` declarados en `responses`.

---

## 4. UI / rutas

| Ruta | Archivo | Guard | Notas |
|---|---|---|---|
| `/transiciones` | `app/(app)/transiciones/page.tsx` | `validateAdmin()` | Biblioteca; **conserva** BottomNav (D-14); incluye enlace «Volver al inicio» |
| `/transiciones/nueva` | `app/(app)/transiciones/nueva/page.tsx` | `validateAdmin()` | **Modo foco** (D-13) |
| `/transiciones/[id]` | `app/(app)/transiciones/[id]/page.tsx` | `validateAdmin()` | **Modo foco** (D-13); 404 → `notFound()` |

**Modo foco (D-13)** — `components/layout/app-layout-client.tsx` (MOD ~8 líneas):

```ts
const FOCUS_MODE_ROUTES = [/^\/transiciones\/nueva$/, /^\/transiciones\/[^/]+$/];
const focusMode = FOCUS_MODE_ROUTES.some((re) => re.test(pathname));
// <main className={cn("flex-1", focusMode ? "pb-0" : "pb-16 md:pb-0")}> … </main>
// {!focusMode && <BottomNav role={role} />}
```

**Entrada (D-14)** — `components/padel/teacher-dashboard.tsx` (MOD ~12 líneas): junto al CTA «Evaluar ahora» (`:55-57`), botón `variant="outline"` → `/transiciones`. Cero cambios en `lib/constants/navigation.ts` y en `bottom-nav.tsx`.

Layout del editor: `max-w-md` móvil → `md:max-w-3xl` con `md:grid-cols-[minmax(0,1fr)_190px]`; filmstrip `md:hidden`; barra contextual fija bajo el canvas (alternativa C). Tokens: sólo CSS variables + `COURT_COLORS`; targets ≥44 px (`size-11`).

---

## 5. Editor — arquitectura técnica

### 5.1 Componentes

| Archivo | Responsabilidad |
|---|---|
| `components/court/EditorStage.tsx` (NEW, client, sólo por `dynamic({ssr:false})`) | Stage interactivo del paso; reutiliza `buildFloor/buildCourtLines/buildNet/buildWallPosts/buildPlayerFigures/buildShotView`, `COURT_COLORS`, `PlayerFigure`, `courtToPx/pxToCourt` |
| `components/court/ScenarioPreview.tsx` (NEW) | Probar: índice + `setTimeout(TWEEN_MS)` + monta `CourtStage` |
| `components/padel/transition-editor/scenario-canvas.tsx` (NEW) | Wrapper medido, `touch-action:none` local, `dynamic(EditorStage)` |
| `components/padel/transition-editor/context-bar.tsx` (NEW) | Nudges ±0.5 m, fijar/quitar tiro |
| `components/padel/transition-editor/step-filmstrip.tsx` (NEW) | Chips numéricos, añadir/duplicar/borrar/reordenar, colapsable |
| `components/padel/transition-editor/editor-screen.tsx` (NEW) | `useReducer` + historial + guardado + preview + EC-05/EC-11 |
| `components/padel/transition-editor/transition-library.tsx` (NEW) | Lista + CTA + empty/loading/error |

Props corregidas (F8):

```ts
type EditorStageProps = {
  step: Paso;
  originPositions: PlayerPositions;          // F7: steps[i-1]?.positions ?? steps[i].positions
  selected: PlayerId | null;                 // F8: sin "ball"
  viewport: CourtViewport;
  onSelect: (target: PlayerId | null) => void;
  onMovePlayer: (id: PlayerId, point: CourtPoint) => void;
  onMoveShot: (patch: { control?: CourtPoint; to?: CourtPoint }) => void;
};
```

Drag (F5/F6) — `CourtParts.tsx` **no se toca**:

```tsx
const hitR = Math.max(22, 0.55 * scale); // F6: diámetro ≥44 px a cualquier ancho
<Group
  draggable
  x={figure.x} y={figure.y}
  dragBoundFunc={(pos) => clampPxToCourt(pos, viewport)}
  onDragStart={(e) => e.cancelBubble = true}
  onDragEnd={(e) => onMovePlayer(id, pxToCourt({ x: e.target.x(), y: e.target.y() }, viewport))}
>
  <Rect x={-hitR} y={-hitR * 1.6} width={hitR * 2} height={hitR * 2} fill="transparent" />
  <PlayerFigure figure={{ ...figure, x: 0, y: 0 }} groupRef={() => {}} />
</Group>
```

- El `Group` es **controlado**: tras `onDragEnd` el re-render fija `x/y` desde props (sin deriva).
- Manijas de tiro: `Circle` sobre `to` (mueve destino) y sobre el midpoint de `control` (dirige la curva); mismo patrón `Group draggable` + `hitR`.
- `onSelect(null)` en tap del fondo; el `hit` derivado se resalta (read-only).
- **No** se importa `CourtStage` aquí (nada de dos relojes rAF).

### 5.2 Lógica pura (Jest, `testEnvironment: node`)

| Archivo | API |
|---|---|
| `lib/padel/court/geometry.ts` (MOD +25, **cabecera actualizada — F15**) | `pxToCourt(point, viewport)`, `clampCourtPoint(point)`; viewport degenerado → `{0,0}` sin NaN; clamp 0..10 / 0..20 (EC-10) |
| `lib/padel/court/history.ts` (NEW ~70) | `createHistory`, `commit`, `undo`, `redo`, `canUndo`, `canRedo`, `HISTORY_LIMIT = 50`; undo/redo vacío = no-op (EC-01) |
| `lib/padel/court/editor.ts` (NEW ~150) | `movePlayer`, `moveShotTo`, `moveShotControl`, `nudgePlayer`/`nudgeShot(±0.5)`, **`setShot(step, to?, control?)`** (F9), `clearShot`, `addStep`, `duplicateStep`, `removeStep` (`{ok:false, reason:"last_step"}`), `reorderSteps` |
| `lib/padel/court/transition.ts` (NEW ~50) | `TransitionScenarioData`, `toCourtScenario(row)`, `emptyTransitionDoc()`, `nextStepId(steps)` |

**`setShot` (F9)** — firma definitiva:

```ts
export function setShot(step: Paso, to?: CourtPoint, control?: CourtPoint): Paso
// from = resolveHitter(step.positions, to ?? defaultTo)  → no se persiste (derivado)
// defaultTo = farPlayerY < NET_Y_M ? { x: 5, y: 2 } : { x: 5, y: 18 }
// control ??= midpoint(from, to); label ??= "GOLPE"
```

`resolveHitter` se **importa** de `CourtLayers`/`annotation` (módulo puro existente) — no se reimplementa.

### 5.3 Conflicto de gestos (EC-04) — sin cambios

`touch-action: none` sólo en el `div` del canvas; `cancelBubble` en nodos arrastrables; resto de la página scrollea normal.

---

## 6. Preview "Probar" (F7)

`ScenarioPreview` mantiene `index` + `playing`; tick `TWEEN_MS = 1000`; avanza con `clampStepIndex`; **`originPositions = steps[index-1]?.positions ?? steps[index].positions`** — la **misma** expresión que `EditorStage` recibe desde `editor-screen.tsx`, para que flechas del editor y del preview coincidan al cambiar el jugador más cercano. Cero reimplementación de rAF/easing/`resolveHitter`/retracción.

---

## 7. Impacto por capa

| Capa | Impacto |
|---|---|
| **auth** | Sin cambios en `auth.ts`/JWT/roles. `protected-routes.ts` (+45, doc-only). `guardAdmin` en 5 endpoints, `validateAdmin` en 3 páginas. |
| **db** | 1 tabla + 1 índice + migración `0012` (**ya aplicada**). Cero cambios en tablas existentes. Lectura defensiva con `safeParse` (D-15). |
| **api** | 5 endpoints nuevos (2 route handlers), 2 submódulos api-docs + `spec.ts` (+6). Sin breaking changes. |
| **ui** | 3 rutas nuevas; 2 componentes en `components/court/`, 4 en `components/padel/transition-editor/`, 1 hook; **2 MOD** de layout/nav: `app-layout-client.tsx` (modo foco) y `teacher-dashboard.tsx` (CTA). `CourtStage`/`PuzzleDemo`/`CourtParts`/`CourtLayers` **sin tocar**. |
| **tests** | 6 unit nuevos (+1 extendido), 2 API, 1 E2E. |
| **env** | **Ninguna variable nueva** → `.env.example` no se modifica. |
| **docs** | `ARCHITECTURE.md` (tabla + endpoints + rutas + modo foco), `FEATURES.md`, `lib/api-docs/spec.ts`. |

---

## 8. Agentes y orden de ejecución

| Orden | Task | Agente |
|---|---|---|
| 1 | **T1** — schema + migración `0012` (**HECHO**) | @db-engineer |
| 2 | **T2** — `queries/padel/transitions.ts` + índice + unit | @db-engineer |
| 3 | **T3** — lógica pura (`geometry`/`history`/`editor`/`transition`) | @app-engineer |
| 4 | **T4** — Zod (§3.3) | @app-engineer |
| 5 | **T5** — route handlers | @app-engineer |
| 6 | **T6** — api-docs | @app-engineer |
| 7 | **T7** — `EditorStage` + `ScenarioPreview` | @app-engineer |
| 8 | **T8** — `scenario-canvas` + `use-transitions` | @app-engineer |
| 9 | **T9** — `context-bar` + `step-filmstrip` + `transition-library` | @app-engineer |
| 10 | **T10** — `editor-screen` | @app-engineer |
| 11 | **T11** — 3 páginas | @app-engineer |
| 12 | **T12a** — unit schemas/editor/history | @app-engineer |
| 13 | **T12b** — unit serialization + geometry extendido | @app-engineer |
| 14 | **T13** — API happy (SQL real + audit_logs) + E2E spec | @app-engineer |
| 15 | **T14** — `protected-routes.ts` + guard spec (**se ejecuta después de T5**, F3) | @auth-security |
| 16 | **T16** — CTA dashboard + modo foco (D-13/D-14) | @app-engineer |
| 17 | **T15** — cleanup: borrar mockup | @app-engineer |

Después: @ponytail-reviewer → @qa-release.

> **Cross-Agent Review: CERRADO en v2.** F1 aceptado y corregido en §3.3; F2/F3 reflejados en `change-map-v2.md` §2; F12 resuelto con D-13/D-14. No se requiere una v3 salvo que @app-engineer detecte un bloqueante nuevo durante T3/T4 (en ese caso: `technical-design-v3.md`, no se sobrescribe v2).

---

## 9. Plan de tests mapeado a AC

| Test | Tipo | AC / EC | Ajustes de v2 |
|---|---|---|---|
| `tests/unit/padel/transition-schemas.test.ts` | Unit | AC-05, EC-03/07/08/10 | + caso explícito de F1: `transitionCreateSchema` parsea `title`+escenario y emite issue con `path[0] === "initialStepIndex"` |
| `tests/unit/padel/court-geometry.test.ts` (MOD) | Unit | AC-06, EC-10 | + `pxToCourt` inversa de `courtToPx`, viewport 0×0, clamp |
| `tests/unit/padel/transition-history.test.ts` | Unit | AC-06, EC-01 | límite 50, no-op |
| `tests/unit/padel/transition-editor.test.ts` | Unit | AC-06, EC-02/05/10 | `setShot` defaults (F9), borrar último, clamp desde drag |
| `tests/unit/padel/transition-serialization.test.ts` | Unit | **AC-02** | round-trip `doc ↔ JSON ↔ CourtScenario`; escenario inválido → `safeParse` fail (F10) |
| `tests/unit/db/transitions-queries.test.ts` | Unit | AC-05 | `safeParse` de `scenario` corrupto → `null`; `stepCount` numérico |
| `tests/api/padel/transitions-guard.spec.ts` | API | **AC-04**, EC-06/09 | escrito en T14, **ejecutado tras T5** (F3) |
| `tests/api/padel/transitions-happy.spec.ts` | API | **AC-05**, EC-03 | CRUD con SQL real + **3 asserts en `audit_logs`** (F14) |
| `tests/e2e/transition-editor.spec.ts` | E2E | AC-01/03/06/**09** | `setViewportSize(375,667)` + `scrollWidth <= 375` (F13); flujo crear→mover→tiro→paso→undo/redo→Probar→guardar→reabrir; USER redirigido; `403` en API |

Gates: `tsc --noEmit` 0, `eslint` 0, `next build` OK, unit+API+E2E verdes, cobertura `lib/padel/` sin regresión >3%, `--api-docs`, `--env` (sin vars nuevas).

---

## 10. Variables de entorno

**Ninguna nueva.** `.env.example` y `.env.local` no se tocan.

---

## 11. Limpieza / rollback

- **Cleanup (T15)**: borrar `components/preview/coach-transition-editor.tsx` (verificado sin referencias). **No** se crea ni se borra ruta `/preview/coach-transition-editor`.
- **Rollback**: migración aditiva (1 tabla + 1 índice, sin FKs entrantes) → `DROP TABLE coach_transitions`. Rutas/componentes nuevos se eliminan sin efectos; los 2 MOD (layout/nav CTA) son reversibles con `git revert`.

---

## 12. Changelog

| Versión | Fecha | Cambio |
|---|---|---|
| v1 | 2026-11-02 | Diseño inicial: 1 tabla, 5 endpoints, `EditorStage` + lógica pura, preview reutilizado, 0 env vars, 8 chunks (C1–C10). |
| **v2** | 2026-11-02 | Cierre de Cross-Agent Review: **F1** corregido (`ZodObject` base + `.extend()` antes de `.superRefine()` compartido, §3.3); **F4** firmas de auditoría (5 args); **F10/D-15** `safeParse` del `scenario`; **F11** `stepCount::int`; **F5/F6/F7/F8/F9** contrato de `EditorStage` y `setShot`; **F12a** CTA en dashboard (rechazado el 8.º ítem de nav); **F12b/D-13** modo foco; **F13/F14** E2E y auditoría en tests; **F15** cabecera de `geometry.ts`. **F2/F3**: plan C1–C10 → **T1–T16**. Rechazado crear `app/preview/.../page.tsx`. Contratos API y ACL sin cambios. |
