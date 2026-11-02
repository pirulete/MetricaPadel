# App Notes — Editor de Transiciones (coach/ADMIN)

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02
> module: `padel`
> owner: @app-engineer (Cross-Agent Review — paso 5 de `/ship-feature`)
> inputs: `technical-design.md` v1, `change-map.md` v1, `auth-impact.md`, `security-checklist.md`, `feature-spec.md`
> **Versioning**: `v1`. Revisiones → `app-notes-v2.md`.

---

## 1. Veredicto de viabilidad

**VIABLE — sin cambios arquitectónicos.** Todos los helpers, convenciones y patrones que el diseño asume existen y coinciden: `guardAdmin`/`validateAdmin` (`lib/auth/admin-guard.ts:20,67`), `auditCreate/Update/Delete` con 5 args (`lib/audit/helpers.ts:18-69`), paginación G15 (`lib/db/queries/padel/pagination.ts:15-23`), route handlers guard-first (`app/api/rubrics/route.ts:17-40`), submódulos api-docs (`lib/api-docs/paths/courses.ts` + `spec.ts` composición final), y `dynamic({ssr:false})` como única puerta a Konva (`components/court/PuzzleDemo.tsx:18-21`).

- **1 bloqueante** (F1: `.refine().extend()` no compila en Zod 3.25.76) → corregible con el snippet de `design-review.md` §F1; no cambia contratos.
- **12 ajustes** de implementación/plan (F2–F15). Detalle y severidades en `design-review.md`.
- **Cross-Agent Review**: observaciones registradas; se requiere que @architect acepte F1 (bloqueante) y F2/F3/F12 (plan) antes de C3/C4.

**Estado real del código al revisar**: C1 (schema + migración `0012_young_betty_ross.sql` + `_journal idx 12`) **ya está aplicado** en el working tree (`lib/db/schema.ts:641-649`); `migration-notes.md` status `applied & verified`. **No regenerar migración.** C1b (queries + unit) y todo lo demás siguen pendientes.

---

## 2. Hallazgos (evidencia)

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| F1 | **BLOQUEANTE** | `transitionScenarioSchema = z.object(...).refine(...)` + `.extend({title})` → `ZodEffects` no tiene `.extend` en zod 3.25 | `package.json:108`; `technical-design.md` §3.3 (`:120-122`) |
| F2 | ajuste | C4/C5/C6/C8 superan el límite de **≤400 líneas/sub-task** de AGENTS.md (546/490/650/460) | `change-map.md:65-79` |
| F3 | ajuste | Gate de C2 («API guard verde») imposible antes de C4 | `change-map.md:71`; `security-checklist.md:76-82` |
| F4 | ajuste | Tabla §3.2 abrevia `auditUpdate` con 4 args; la firma real es de 5 | `lib/audit/helpers.ts:36-42` |
| F5 | ajuste | `PlayerFigure` fija `x/y` por props y `listening={false}` → drag requiere `Group` externo + hit-area hermana y `figure={{...figure, x:0, y:0}}` | `components/court/CourtParts.tsx:19-36` |
| F6 | ajuste | Hit-area 0.55 m ≈ 41 px de diámetro a 375 px de ancho (< 44 px de AC-01) → `Math.max(22, 0.55*scale)` | `lib/padel/court/geometry.ts:32-37` (37.5 px/m) |
| F7 | ajuste | Editor debe usar `steps[i-1].positions` como `originPositions` para que el tiro coincida con el preview | `components/court/CourtLayers.ts:365-394`; `PuzzleDemo.tsx:33-34` |
| F8 | ajuste | `selected: PlayerId \| "ball"` sin handler de movimiento → estado muerto | `technical-design.md` §5.1 (`:167-177`) |
| F9 | ajuste | `setShotFrom` sin firma; el modelo no guarda origen (derivado) → definir `setShot(step, to, control?)` + label por defecto | `technical-design.md` §5.2 (`:186`) |
| F10 | ajuste | `scenario` es `jsonb` sin `$type<>` → `unknown` en lectura; `safeParse` obligatorio (evita 500 en `PUT`/página) | `lib/db/schema.ts:643` |
| F11 | ajuste | `stepCount` en SQL: `COALESCE(jsonb_array_length(...), 0)::int` | `technical-design.md` §3.2 (`:111`) |
| F12 | ajuste | Sin entrada de navegación y `BottomNav` siempre visible en `(app)` (D5 pide modo foco) | `lib/constants/navigation.ts:3-11`; `components/layout/app-layout-client.tsx:23`; `design-exploration.md:149` |
| F13 | ajuste | E2E sin viewport móvil ni assert de scroll horizontal; `playwright.config.ts` no define projects | `playwright.config.ts:1-12` |
| F14 | ajuste | Falta assert de `audit_logs` en happy-path | `security-checklist.md:84` |
| F15 | ajuste | `geometry.ts/types.ts/annotation.ts` se declaran «SPIKE NO PRODUCTIVO — borrable» y pasan a ser dependencia productiva | `lib/padel/court/geometry.ts:3` |

Detalle completo con snippets corregidos: `design-review.md`.

---

## 3. Plan de sub-tasks confirmado (re-chunkeado, db → api → ui)

Reglas aplicadas: **≤5 archivos y ≤400 líneas est.** por task; dependencias en orden; ningún implementador ejecuta `next build`/`playwright`/`db:migrate`.

| Task | Agente | Archivos exactos | Líneas est. | Dep. | Gate de salida |
|---|---|---:|---:|---|---|
| **T1** | @db-engineer | ✅ `lib/db/schema.ts` (ya hecho), ✅ `drizzle/0012_young_betty_ross.sql` + `drizzle/meta/0012_snapshot.json` + `_journal.json` (ya hecho) | ~25 | — | **HECHO** (`migration-notes.md`). Verificar columnas/índice con `information_schema`/`pg_indexes` si hay duda |
| **T2** | @db-engineer | `lib/db/queries/padel/transitions.ts` (NEW ~170), `lib/db/queries/padel/index.ts` (MOD +1), `tests/unit/db/transitions-queries.test.ts` (NEW ~130) | ~300 | T1 | Jest verde; `getTransitionById(ownerId,id)` safeParse (F10); `stepCount` `::int` (F11); mock necesita `db.delete` además de select/insert/update (`tests/unit/db/courses.test.ts:13-31`) |
| **T3** | @app-engineer | `lib/padel/court/geometry.ts` (MOD +25, `pxToCourt`+`clampCourtPoint`), `lib/padel/court/history.ts` (NEW ~70), `lib/padel/court/editor.ts` (NEW ~150), `lib/padel/court/transition.ts` (NEW ~50) | ~295 | — | Unit puros verdes; sin imports de React/Konva; cabecera de `geometry.ts` actualizada (F15) |
| **T4** | @app-engineer | `lib/validations/padel.ts` (MOD +55) | ~55 | T3 | Zod corregido (F1); `tsc` 0 |
| **T5** | @app-engineer | `app/api/transitions/route.ts` (NEW ~110), `app/api/transitions/[id]/route.ts` (NEW ~150) | ~260 | T2, T4 | 201/200/400/404; guard-first; put con read previo + `auditUpdate` 5 args (F4); delete `.returning()` |
| **T6** | @app-engineer | `lib/api-docs/paths/transitions.ts` (NEW ~150), `lib/api-docs/schemas/transitions.ts` (NEW ~130), `lib/api-docs/spec.ts` (MOD +6) | ~286 | T5 (contratos) | `validate-harness.js --api-docs` OK; 401/403/404 en `responses` |
| **T7** | @app-engineer | `components/court/EditorStage.tsx` (NEW ~260), `components/court/ScenarioPreview.tsx` (NEW ~110) | ~370 | T3 | Konva solo aquí; F5/F6/F7/F8 aplicados; `CourtStage`/`CourtParts` intactos |
| **T8** | @app-engineer | `components/padel/transition-editor/scenario-canvas.tsx` (NEW ~120), `hooks/use-transitions.ts` (NEW ~120) | ~240 | T4, T5, T7 | `dynamic(...,{ssr:false})` como única entrada a Konva; hook sin lógica de autorización |
| **T9** | @app-engineer | `components/padel/transition-editor/context-bar.tsx` (NEW ~90), `step-filmstrip.tsx` (NEW ~120), `transition-library.tsx` (NEW ~130) | ~340 | T3, T8 | Estados del mockup; targets ≥44 px; filmstrip con chips numéricos (no N canvases) |
| **T10** | @app-engineer | `components/padel/transition-editor/editor-screen.tsx` (NEW ~190) | ~190 | T7–T9 | Undo/redo, EC-05, EC-11 (dirty state), guardado, Probar |
| **T11** | @app-engineer | `app/(app)/transiciones/page.tsx` (NEW ~20), `.../nueva/page.tsx` (NEW ~25), `.../[id]/page.tsx` (NEW ~35), `app/preview/coach-transition-editor/page.tsx` (NEW ~6) | ~86 | T9, T10 | `await validateAdmin()` primera sentencia; 404→`notFound()` |
| **T12a** | @app-engineer | `tests/unit/padel/transition-schemas.test.ts` (NEW ~110), `transition-editor.test.ts` (NEW ~150), `transition-history.test.ts` (NEW ~90) | ~350 | T3, T4 | Jest verde |
| **T12b** | @app-engineer | `tests/unit/padel/transition-serialization.test.ts` (NEW ~70), `court-geometry.test.ts` (MOD +40) | ~110 | T3 | Round-trip AC-02 |
| **T13** | @app-engineer | `tests/api/padel/transitions-happy.spec.ts` (NEW ~140), `tests/e2e/transition-editor.spec.ts` (NEW ~120) | ~260 | T5, T11 | Escritos (los ejecuta @qa-release): SQL real + `audit_logs` (F14); E2E `setViewportSize(375,667)` + no-scroll (F13) |
| **T14** | @auth-security | `lib/auth/protected-routes.ts` (MOD +45), `tests/api/padel/transitions-guard.spec.ts` (NEW ~140) | ~185 | T5 (para verificar) | 5 claves; **ejecutar el spec después de T5** (F3): 401/403(USER, TEMPORARY)/404 IDOR cross-coach |
| **T15** | @app-engineer | `components/preview/coach-transition-editor.tsx` (DEL), `app/preview/coach-transition-editor/page.tsx` (DEL) | — | T11 | Ambos eliminados; ninguna referencia residual |
| **T16** | @app-engineer | `lib/constants/navigation.ts` (MOD +1 tarjeta/ítem), `components/layout/app-layout-client.tsx` (MOD ~3) | ~5 | T11 | **Solo si @architect aprueba F12**; alternativa: tarjeta de acceso en `/dashboard` |

**Orden recomendado de ejecución:** `T1(done) → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12a → T12b → T13 → T14 → T16 → T15`, con @ponytail-reviewer antes de @qa-release.

---

## 4. Notas de implementación (no obvias)

1. **Guard-first**: en los 5 handlers, `guardAdmin` corre **antes** de `await request.json()`, `await params` y cualquier query (patrón literal de `app/api/rubrics/[id]/route.ts:22-26` y `security-checklist.md:32`).
2. **`ownerId`**: siempre `session!.user.id as string`; nunca en body/query/path. Listado con cursor: `and(eq(ownerId), lt(updatedAt, new Date(cursor)))` (`courses.ts:88-92` como molde).
3. **`PUT`**: read previo solo para `oldValues` (F4/F10) → `null` ⇒ 404 sin update ni auditoría; el update lleva `where(and(eq(id), eq(ownerId))).returning()` ⇒ `[]` ⇒ 404 (sin TOCTOU).
4. **`DELETE`**: `auditDelete` con la fila de `.returning()`; respuesta `{ deleted: true, id }`.
5. **`stepCount`**: `sql<number>\`COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)::int\`` — sin interpolation de input.
6. **`EditorStage`**: `Stage listening` (sin `pointerEvents:"none"`), capas 1–3 read-only reutilizando `buildFloor/buildCourtLines/buildWallPosts/buildNet/buildPlayerFigures/buildShotView` + `COURT_COLORS` (`CourtLayers.ts:183-394`); `onSelect(null)` en tap de fondo; `typeof window` no se toca (solo entra por `dynamic ssr:false`).
7. **`touch-action`**: `style={{ touchAction: "none" }}` + `touch-none` solo en el `div` del canvas (`scenario-canvas.tsx`), nunca en `body`.
8. **`ScenarioPreview`**: `setTimeout(TWEEN_MS)` + `clampStepIndex`; `originPositions = steps[i-1]?.positions ?? steps[i].positions` (F7); no reimplementar rAF/easing/`resolveHitter`.
9. **`transition.ts`**: `toCourtScenario(row)` reconstruye `{ id, title, initialStepIndex, steps }` desde columnas + scenario parseado; `emptyTransitionDoc()` 1 paso; `nextStepId(steps)` = `max(id)+1`.
10. **Páginas**: `app/(app)/templates` no aplica; usar `Section` como `app/(app)/rubricas/[id]/page.tsx:13-19`, y `fetch` con cookies **desde el client component** (el server-side sin cookies daría 401, `auth-impact.md:76`).

---

## 5. Addendum — resolución de @architect (v2, 2026-11-02)

Referencia: `technical-design-v2.md` §0 y `change-map-v2.md` §2. Se aceptan **F1–F11, F13–F15**; **F12 aceptado con cambio**; **1 extra rechazado**. Solo 3 deltas sobre el plan de §3 de este archivo:

| Delta | Antes (§3) | Ahora (v2) |
|---|---|---|
| **T11** | incluía `app/preview/coach-transition-editor/page.tsx` (NEW ~6) | **eliminado**: no existe hoy, 0 referencias y el mockup ya está aprobado; T11 queda en 3 páginas (~80 líneas) |
| **T15** | borraba mockup + ruta preview | **solo** `components/preview/coach-transition-editor.tsx` (verificado sin referencias) |
| **T16** | «solo si @architect aprueba F12»: ítem en `navigation.ts` | **CTA en `teacher-dashboard.tsx`** (+12, D-14) **+ modo foco** en `app-layout-client.tsx` (+8, D-13). **Prohibido** añadir 8.º ítem a `ADMIN_NAV_ITEMS` (ya son 7 en 375 px) |

Resto de tasks sin cambios. **Regla vinculante para T4**: `.extend()` solo sobre `ZodObject` limpio; `.superRefine()` siempre al final (patrón exacto en `technical-design-v2.md` §3.3, verificado con `tsc` + runtime sobre zod 3.25.76).
