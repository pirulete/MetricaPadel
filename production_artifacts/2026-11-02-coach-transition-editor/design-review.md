# Design Review (viabilidad) — Editor de Transiciones

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02
> owner: @app-engineer (Cross-Agent Review, paso 5 de `/ship-feature`)
> inputs: `technical-design.md` (v1), `change-map.md` (v1), `auth-impact.md`, `security-checklist.md`, `feature-spec.md`
> **Versioning**: `v1`. Revisiones → `design-review-v2.md`.

---

## 0. Veredicto

**VIABLE.** El diseño encaja con los patrones reales del repo: `guardAdmin`/`validateAdmin`, `auditCreate/Update/Delete`, paginación G15, route handlers con guard-first y `lib/api-docs/{paths,schemas}/` existen exactamente como se asumen. No hay cambio arquitectónico requerido → **no hace falta `technical-design-v2.md`** si @architect acepta las correcciones puntuales de abajo (§2).

- **Bloqueantes: 1** (F1 — snippet Zod que no compila con la versión real de Zod).
- **Ajustes: 12** (ninguno cambia contratos API ni ACL).
- **Riesgo sobre features existentes: bajo** (`CourtStage`, `PuzzleDemo`, `CourtParts`, `CourtLayers` intactos; schema y migración aditivos).

---

## 1. Validaciones positivas (contra código real)

| # | Premisa del diseño | Evidencia | Resultado |
|---|---|---|---|
| V1 | `guardAdmin` síncrono `NextResponse \| null` | `lib/auth/admin-guard.ts:67-75` (rol `ADMIN_ROLES` + `status==='ACTIVE'`) | ✅ |
| V2 | `validateAdmin()` redirige | `lib/auth/admin-guard.ts:20-33` | ✅ |
| V3 | `auditCreate/Update/Delete` genéricos | `lib/audit/helpers.ts:18-31`, `:36-51` (**5 args**), `:56-69` | ✅ (ver F4: corregir tabla §3.2 del diseño que abrevia 4) |
| V4 | `extractRequestContext` | `lib/audit/helpers.ts:238-245` | ✅ |
| V5 | Patrón route handler guard-first + Zod | `app/api/rubrics/route.ts:17-40`; `app/api/rubrics/[id]/route.ts:17-41, 49-86` | ✅ idéntico al propuesto |
| V6 | Envoltorios `{ items, nextCursor }` | `app/api/rubrics/route.ts:32`; `lib/db/queries/padel/pagination.ts:15-23` | ✅ |
| V7 | Cursor `limit+1` + `lt(orderField, cursor)` | `lib/db/queries/padel/courses.ts:84-117` | ✅ (copiar tal cual, cambiando `createdAt`→`updatedAt`) |
| V8 | Convención `getXById(ownerId, id)` | `lib/db/queries/padel/courses.ts:148` | ✅ |
| V9 | `paginationQuerySchema` / `padelIdParamsSchema` reutilizables | `lib/validations/padel.ts:19-22`, `:10-12` | ✅ |
| V10 | Submódulos de api-docs + spread en `spec.ts` | `lib/api-docs/paths/courses.ts:1-40`; `lib/api-docs/spec.ts:947-957` (composición final) | ✅ |
| V11 | `db.query.<export>` disponible | `lib/db/index.ts:13-18` (`drizzle(pool, { schema })`); `lib/db/schema.ts:641-649` | ✅ |
| V12 | C1 (schema + migración) ya ejecutado | `lib/db/schema.ts:641-649`; `drizzle/0012_young_betty_ross.sql`; `_journal.json` `idx: 12`; `migration-notes.md` status applied | ✅ — **no regenerar** |

---

## 2. Hallazgos

### F1 — BLOQUEANTE: `transitionScenarioSchema.extend(...)` no compila (Zod 3)

El diseño (§3.3) hace `z.object({...}).refine(...)` y luego `.extend({ title })`. En **Zod 3.25.76** (`package.json:108`) `.refine()` devuelve `ZodEffects`, que **no** expone `.extend` → error de TypeScript y gate `typecheck` en rojo.

**Corrección (no cambia contrato):**

```ts
const transitionScenarioObjectSchema = z.object({
  initialStepIndex: z.number().int().min(0),
  steps: z.array(transitionStepSchema).min(1, "mínimo 1 paso").max(50),
});
export const transitionScenarioSchema = transitionScenarioObjectSchema.refine(
  (v) => v.initialStepIndex < v.steps.length, { message: "initialStepIndex fuera de rango" });
export const transitionCreateSchema = transitionScenarioObjectSchema
  .extend({ title: z.string().trim().min(1, "title es requerido").max(200) })
  .refine((v) => v.initialStepIndex < v.steps.length, { message: "initialStepIndex fuera de rango" });
```

### F2 — AJUSTE: chunks C4, C5, C6 y C8 exceden el límite de la regla AGENTS.md (≤400 líneas)

`change-map.md` §2 solo valida «≤5 archivos», pero AGENTS.md limita **≤5 archivos o ≤400 líneas**. Sumas reales: C4 = 546, C5 = 490, C6 = 650, C8 = 460. Ver plan re-chunkeado en `app-notes.md` §3 (16 tasks, todas ≤400).

### F3 — AJUSTE: el gate de C2 no se puede cumplir antes de C4

`C2` (@auth-security) cierra con «API guard verde», pero `tests/api/padel/transitions-guard.spec.ts` necesita los handlers de C4 + tabla migrada. Escribir el spec en C2 es válido; **el verde se valida después de C5**. Reordenar: `C1 → C1b → C3 → C4 → C5 → … → C2-verify`.

### F4 — AJUSTE: tabla §3.2 del diseño abrevia `auditUpdate` con 4 args

Ya detectado en `auth-impact.md:171-172`. Firma real: `auditUpdate(entityName, entityId, oldValues, newValues, context)` (`lib/audit/helpers.ts:36-42`). Implementar con 5.

### F5 — AJUSTE: `PlayerFigure` no es "reutilizable tal cual" para drag

`PlayerFigure` renderiza el `Group` con `x`/`y` **desde props** y `listening={false}` (`components/court/CourtParts.tsx:19-36`). Para arrastrar:

```tsx
<Group draggable x={figure.x} y={figure.y} dragBoundFunc={...} onDragStart={...} onDragEnd={...}>
  <Rect x={-hitR} y={-hitR * 1.6} width={hitR*2} height={hitR*2} fill="transparent" />
  <PlayerFigure figure={{ ...figure, x: 0, y: 0 }} groupRef={() => {}} />
</Group>
```

El hit-area debe ser **hermano** de `PlayerFigure` dentro del `Group` draggable (no se toca `CourtParts.tsx`), y el `Group` es controlado: tras `onDragEnd` se emite `onMovePlayer` y el re-render fija `x/y`. Confirmar que `EditorStage` es el único que importa drag (nada nuevo en `CourtStage`).

### F6 — AJUSTE (AC-01): el hit-area de 0.55 m puede quedar bajo 44 px

A 375 px de ancho, `computeScale ≈ 37.5 px/m` → 0.55 m ≈ 20.6 px de radio (**41 px** de diámetro < 44). Usar `radiusPx = Math.max(22, 0.55 * scale)`.

### F7 — AJUSTE (AC-02/AC-03): el origen del tiro en el editor debe usar posiciones del paso anterior

`buildShotView(step, viewport, 0, originPositions)` deriva el origen con `resolveHitter(originPositions, shot.to)` (`components/court/CourtLayers.ts:365-394`), y `CourtStage`/`PuzzleDemo` le pasan el **paso anterior** (`components/court/PuzzleDemo.tsx:33-34`). Si el editor pasa `step.positions`, el editor y el preview mostrarán flechas distintas al cambiar el jugador más cercano. Regla única: **editor y preview usan `steps[i-1]?.positions ?? steps[i].positions`**.

### F8 — AJUSTE: `selected: PlayerId | "ball"` sin handler de movimiento

Las props de `EditorStage` no exponen `onMoveBall`; el origen de la pelota es derivado (F7), así que «seleccionar pelota» quedaría como estado muerto. Opciones: (a) quitar `"ball"` de la unión (YAGNI), o (b) mantenerlo **solo** como resaltado read-only y documentarlo. Recomendado: (b) `selected: PlayerId | null` + resaltar el `hit` derivado.

### F9 — AJUSTE: `setShotFrom` sin firma definida

`editor.ts` lista `setShotFrom` pero el modelo no guarda origen (derivado). Definir `setShot(step, to, control?)` con defaults (`to = { x: 5, y: 2 }` si el jugador está en el campo norte, espejo si está al sur; `control = midpoint(from, to)`) y `label` por defecto p. ej. `"GOLPE"`, respetando `label` 1..40 del schema.

### F10 — AJUSTE: `scenario` es `jsonb` sin tipo → validar al leer

`lib/db/schema.ts:643` declara `jsonb("scenario").notNull()` sin `$type<>` (correcto, D-03). Consecuencia: `row.scenario` llega como `unknown`. `getTransitionById`/`listTransitions` deben hacer `transitionScenarioSchema.safeParse(row.scenario)`; fallo → `null` (404) en detalle y omisión/`stepCount` vía SQL en listado. Sin esto, una fila corrupta revienta el `PUT` (`old.steps.length`) y la página con 500.

### F11 — AJUSTE: `jsonb_array_length` necesita cast

`sql<number>` sobre `jsonb_array_length(...)` devuelve `int4`, que node-postgres entrega como `number`, pero para el contrato `TransitionSummary.stepCount: number` es más seguro `COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)::int`.

### F12 — AJUSTE: falta el punto de entrada a `/transiciones` y el modo foco

- `lib/constants/navigation.ts:3-11` (`ADMIN_NAV_ITEMS`) no está en el change-map → sin esta línea la feature es inalcanzable salvo URL manual (el `ADMIN` ya tiene 7 ítems en un bottom-nav de 375 px: valorar tarjeta en `/dashboard` en vez de un 8.º ítem).
- `components/layout/app-layout-client.tsx:23` renderiza `BottomNav` **siempre** dentro de `app/(app)`, y `design-exploration.md:149` (D5) pide editor a pantalla completa sin nav. Opciones: (a) aceptar nav visible (cambia el mockup aprobado), o (b) `MOD` de `app-layout-client.tsx` con `usePathname()` para ocultarla en `/transiciones/nueva` y `/transiciones/[id]`. Recomendado (b), 3 líneas.

### F13 — AJUSTE: E2E debe fijar el viewport y no hay assert de AC-01

`playwright.config.ts` no define `projects`/`viewport` y **ningún** spec usa `setViewportSize`. El spec de la feature debe hacer `await page.setViewportSize({ width: 375, height: 667 })` y aseverar ausencia de scroll horizontal (`document.documentElement.scrollWidth <= 375`), además del flujo crear→mover→tiro→paso→undo/redo→Probar→guardar→reabrir.

### F14 — AJUSTE (menor): auditar `audit_logs` en el happy-path

`security-checklist.md:84` exige verificar `audit_logs` (`entity_name='coach_transition'`, `action_type`, `user_id`). Añadir esos `SELECT` al `*-happy.spec.ts` (SQL real ya disponible vía `tests/api/auth/helpers.ts`, `insertUser` acepta `status` **y** rol se fija con SQL propio si hace falta `ADMIN`).

### F15 — AJUSTE (menor): comentarios "SPIKE NO PRODUCTIVO — borrable"

`lib/padel/court/geometry.ts:3`, `types.ts:3`, `annotation.ts:3` se declaran borrables; el editor pasa a depender de ellos en producción. Actualizar la cabecera de `geometry.ts` al tocar el archivo (C3). No se modifican `CourtStage`/`PuzzleDemo`.

---

## 3. Riesgo sobre features existentes

| Activo | Riesgo | Evidencia / mitigación |
|---|---|---|
| `CourtStage` (animación) | Nulo | No se modifica; `EditorStage` es un componente hermano que no lo importa (`components/court/CourtStage.tsx:84`) |
| `PuzzleDemo` / `/puzzle-demo` | Nulo | Sin cambios; sigue siendo el único consumidor actual del Stage |
| `CourtParts` / `CourtLayers` | Nulo | Solo lectura (F5 usa `PlayerFigure` con overrides de props) |
| `geometry.ts` | Bajo | Cambios aditivos (`pxToCourt`, `clampCourtPoint`); `courtToPx` intacto → `tests/unit/padel/court-geometry.test.ts` extendido |
| `schema.ts` | Nulo | Tabla + índice nuevos; migración `0012` aditiva ya aplicada |
| Auth | Nulo | Solo `protected-routes.ts` (doc-only, `as const`) y guards existentes |
| API existentes | Nulo | 2 handlers nuevos en rutas nuevas; ningún contrato tocado |

---

## 4. Cobertura de AC por el plan de tests

| AC | Cubierto por | Hueco |
|---|---|---|
| AC-01 (375×667, ≥44 px) | E2E | ⚠️ F13 (viewport + scroll) / F6 (hit-area) |
| AC-02 (round-trip) | `transition-serialization.test.ts` | — |
| AC-03 (preview sin motor nuevo) | revisión de imports + E2E | aceptable (no automatizable barato) |
| AC-04 (guard 401/403/404 IDOR) | `transitions-guard.spec.ts` | — (incluye TEMPORARY/ADMIN, F3 ordena ejecución) |
| AC-05 (CRUD + auditoría + docs) | `transitions-happy.spec.ts` + api-docs | ⚠️ F14 (assert audit_logs) |
| AC-06 (gates + unit puros + E2E) | 5 unit + E2E + harness | — |

---

## 5. Acción pedida a @architect

1. Aceptar el erratum Zod de F1 (o publicar `technical-design-v2.md` con §3.3 corregido) — **bloqueante** para C3/C4.
2. Aceptar el re-chunking de F2/F3 (plan en `app-notes.md` §3) — no cambia archivos ni contratos.
3. Decidir F12 (entrada de navegación + ocultar `BottomNav` en el editor) → añadir 1–2 archivos `MOD` al change-map.
4. El resto (F5–F11, F13–F15) son decisiones de implementación ya resueltas; no requieren v2.
