# Repair Report — Fix "Descubribilidad + comprensión del Editor de Transiciones"

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor` · release: **v0.10**
> date: 2026-11-03 · owner: **@qa-release** (validación) · ejecutores: @app-engineer (chunks A/B/C), @ponytail-reviewer (simplificación)
> Insumos: `problems-triage.md`, `repair-plan.md`, `design-approved.md`, `ponytail-review-report.md`, `test-matrix.md` §5, `release-report.md`.
> **No es un hotfix de producción**: es el cierre del fix UX dentro de `rama-preview`, antes de `/supercommitpro`.

---

## 1. Qué se arregló, por grupo

### G1 · Descubrimiento — "no encuentro cómo entrar al editor" (LOW)

| Aspecto | Antes | Después |
|---|---|---|
| Entry point | Sólo un CTA `variant="outline"` en el header del dashboard; el `BottomNav` ya está saturado a 7 items y el editor oculta el nav (modo foco) ⇒ sin retorno por nav | **FAB flotante persistente** (`fixed`, `size-14` en móvil, pill `md+`) montado una sola vez en `AppLayoutClient` → `/transiciones/nueva` en **1 toque** |
| Visibilidad | N/A | Función **pura** `canShowTransitionFab(role, pathname)` (`lib/constants/navigation.ts`): ADMIN/SUPER_ADMIN en 7 rutas de trabajo; oculto en `/transiciones*`, `/settings`, `/admin/**` y para USER |
| Copy del CTA existente | "Transiciones" (sustantivo ambiguo) | **"Preparar jugada"** (verbo de acción); el botón se conserva por decisión del usuario |
| Novedad | — | Punto `size-2` la primera sesión, dismissible, `localStorage["padel.transitionFab.seen"]`, leído con `useSyncExternalStore` (+ `getServerSnapshot` ⇒ cero mismatch de hidratación) |
| Seguridad | — | Sin cambios: `validateAdmin` sigue en `/transiciones/nueva`; el FAB **nunca** es frontera de autorización |
| `BottomNav` | 7 items | **7 items, intacto** |

**Archivos**: `components/layout/app-layout-client.tsx` (33→99 L), `lib/constants/navigation.ts` (+`canShowTransitionFab`), `components/padel/teacher-dashboard.tsx` (1 string).

### G2 · Onboarding — "no sé qué sigue" (MEDIUM)

| Aspecto | Antes | Después |
|---|---|---|
| Representación del flujo | El editor orquesta 6 estados (`steps/selected/dirty/saving/previewing/previewIndex`) pero **no los expone** como progreso; la única pista vive bajo el canvas | **`flow-strip.tsx`** presentacional (`<nav aria-label="Flujo del editor">` → `<ol>/<li>`) con 5 fases `①Paso ②Mueve ③Tiro ④Prueba ⑤Guarda` y `aria-current="step"` en el activo; **sin** `role="tab"`/`<button>` para no romper los locators E2E |
| Derivación del paso | — | Función pura `deriveFlowStep({ stepsCount, selected, hasShot, dirty, previewing })` → 1..5, con precedencia explícita (`previewing` > `stepsCount=0` > resto). **Sin estado nuevo, sin `localStorage`** |
| Post-guardado | — | Colapsa a 1 línea ("Paso N de 5 · …"), liberando los ~28 px que consumía |
| Ubicación | — | `md:sticky` bajo la cabecera; montado en `editor-screen.tsx` (+10 L, sin tocar estado/mutaciones) |

**Archivos**: `lib/padel/court/flow.ts` ✨ (53 L), `components/padel/transition-editor/flow-strip.tsx` ✨ (83 L), `editor-screen.tsx` (344→354 L).

### G3 · Affordances y copy — "Probar y Guardar parecen lo mismo" (MEDIUM)

| Aspecto | Antes | Después |
|---|---|---|
| Gestos implícitos | Sólo `aria-label` (invisible) en `scenario-canvas`; el hint real estaba enterrado bajo el lienzo | **Badge flotante `role="status"`** `pointer-events-none` con 3 ramas: "Toca un jugador para moverlo" · "Arrastra el arco para curvar el tiro" · "Sin tiro · toca ◎ para fijarlo" |
| Probar vs Guardar | Dos botones sin jerarquía semántica; indistinguibles | `aria-describedby` → `#transition-preview-hint` ("…en memoria · no guarda") y `#transition-save-hint` ("Guarda en tu biblioteca"). **Nombres accesibles "Probar"/"Guardar" intactos** |
| Estado del documento | Texto plano 11 px "sin guardar"/"guardado" | **Badge** `● Cambios sin guardar` / `✓ Guardado` (fuente única tras la simplificación de @ponytail-reviewer, que eliminó el duplicado del filmstrip) |
| Feedback de guardado | — | Botón "Guardado ✓" ≤2 s **sin** renombrar el botón (aria-label estable ⇒ sin flake E2E) |
| Filmstrip | "Pasos · N" · "← Mover / Mover →" · `+` solo | "Secuencia · N pasos" + subtítulo "Cada paso es una foto de la jugada" · "← Antes / Después →" · "+ Añadir paso" (`aria-label` siempre, texto en `md+`) |
| Manija del arco | Círculo Konva sin anillo ni grip | Anillo `strokeWidth` 3 + punto central (sólo estilo; **cero** cambios de hit-testing/animación) |

**Archivos**: `context-bar.tsx` (234 L), `step-filmstrip.tsx` (186 L), `scenario-canvas.tsx` (105 L), `components/court/EditorStage.tsx` (304 L).

**Simplificación aplicada por @ponytail-reviewer** (net **−3 L, +0**): `<span aria-hidden>` spacer → `ml-auto`; 2 `export` sin consumidor; indicador `· sin guardar` duplicado en el filmstrip; `title` redundante con `aria-label`.

---

## 2. BUG REAL del FAB (`position: relative`) — causa raíz, fix y cobertura

### 2.1 Síntoma

El FAB **no aparecía** en el viewport aunque el DOM lo contenía, el enlace era navegable por teclado y el árbol de React era correcto. Ningún gate estático lo detectó: `tsc` 0, `lint` 0, 882 unit verdes, build OK. **Sólo la aserción de geometría del E2E lo cazó.**

### 2.2 Causa raíz (mecanismo exacto)

```
<Button asChild size="icon" className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] …">
  <Link href="/transiciones/nueva" className="relative">   ← causa
    <Route /> <span className="hidden md:inline">Nueva transición</span>
    <span className="absolute right-2 top-2 size-2 …" />   ← dot de novedad (necesitaba ancestro posicionado)
  </Link>
</Button>
```

1. `asChild` + `Slot` **fusionan** el `className` del `Button` y el del `Link` en **un único elemento `<a>`** (no hay wrapper).
2. Ese `<a>` queda con `position: fixed` **y** `position: relative` en la misma declaración de clases.
3. Ambas utilidades tienen la **misma especificidad** (una clase) ⇒ gana la **última emitida en el CSS**, no la del "padre".
4. Tailwind ordena `position` como `static → absolute → fixed → relative → sticky`, así que **`.relative` se emite después de `.fixed`**. Verificado empíricamente sobre el CSS construido:

   ```
   $ python3 -c "…re.finditer(r'\.(fixed|absolute|relative|sticky)\{', css)…"
   absolute 12588 · fixed 12616 · relative 12638 · sticky 12690     # .next/static/chunks/1z43h72gl3tu7.css
   ```

5. Con `position: relative` ganando, `bottom: calc(4.75rem + env(safe-area-inset-bottom))` **deja de ser un offset de viewport** y pasa a desplazar el `<a>` ~76 px **hacia arriba respecto de su posición de flujo** ⇒ `boundingBox().y ≈ −76` ⇒ **FAB fuera de pantalla** (y el `absolute` del dot pasaba a resolverse contra un `relative`, no contra el viewport).

**Lección transversal**: con `asChild`/`Slot` **nunca** dupliques la utilidad de `position` entre padre e hijo — no existe "el padre manda"; existe un solo elemento y gana el orden del CSS.

### 2.3 Fix aplicado — 1 línea

```diff
-            className="relative"
             onClick={dismissFabHint}
```

Se eliminó `className="relative"` del `<Link>`. El punto de novedad **sigue funcionando** porque su ancestro posicionado pasa a ser el propio `<a>` con `fixed` (que establece containing block para descendientes `absolute`). Estado final (`app-layout-client.tsx:74-96`): `Button asChild` con `fixed … size-14 …` · `Link` **sin clases de posición** · dot `absolute right-2 top-2`.

### 2.4 Cobertura que impide la regresión

| Test | Assert | Qué bloquea |
|---|---|---|
| `tests/e2e/transition-fab.spec.ts:104-109` (A5) | `box.width ≥ 48`, `box.height ≥ 48`, `box.y + box.height ≤ 667 − 61` | Cualquier `position` que saque el FAB del viewport o lo meta bajo el `BottomNav` (el assert con `y` negativo falla) |
| `tests/e2e/transition-fab.spec.ts:115` (A3) | `toBeVisible()` + `waitForURL("**/transiciones/nueva")` | FAB presente pero no clicable |
| `tests/e2e/transition-fab.spec.ts:127` (A4) | `toHaveCount(0)` para USER | Fuga de la acción a un rol sin permiso |

**Severidad**: **S1 (bloqueante)** — el entry point del fix era inoperante en silencio. **Estado: cerrado y revalidado** (6/6 E2E verde tras el fix, `release-report.md` §2).

### 2.5 ¿Por qué no lo cazaron los gates estáticos?

`tsc`/`lint`/unit no ven CSS resuelto; `build` tampoco falla por un elemento posicionado mal. Es exactamente el tipo de defecto que sólo un assert **geométrico** en navegador real detecta. **Acción de proceso recomendada**: cuando un fix introduce un elemento `fixed`/`absolute` vía `asChild`, el spec debe assertar `boundingBox()` (no sólo `toBeVisible()`), como ya hace A5.

---

## 3. Regresiones encontradas

**Ninguna.** Evidencia:

| Área | Verificación | Resultado |
|---|---|---|
| Motor Konva (`CourtStage`, animación) | `puzzle-demo.spec.ts` (2 tests) tras tocar el estilo de `EditorStage` | ✅ 2/2 |
| Locators E2E históricos ("Probar", "Guardar", `/^Paso/`, "Añadir paso") | strict mode en `transition-editor.spec.ts` **sin reescribirlos** | ✅ 1 elemento cada uno |
| Lógica pura del editor (`editor.ts`, `history.ts`, `transition.ts`) | 28 + 10 + 13 + 22 + 12 unit tests, sin cambios | ✅ 85/85 |
| Contrato API (`/api/transitions`, Zod) | 22 unit + `transitions-guard.spec.ts` sin cambios; **0 diff** en `app/api/**` y `lib/validations/padel.ts` | ✅ |
| `BottomNav` (7 items) | `*_NAV_ITEMS` sin diff | ✅ |
| Bibliotecas/heading "Transiciones" | assert `transition-editor.spec.ts:102` verde | ✅ |
| Auth (guard `/transiciones/nueva`, rol USER) | E2E: USER → `/dashboard`; API → 403 | ✅ |

---

## 4. Estado final de los gates

| Gate | Resultado real |
|---|---|
| `npx tsc --noEmit` | exit 0 · 0 errores |
| `pnpm run lint` | 0 errores · 255 warnings preexistentes |
| `pnpm run test:unit` | **882/882** (67 suites) · `flow.ts` 100 % |
| `playwright test` (fab + editor + puzzle-demo, con `DATABASE_URL` :5434) | **6/6** · 0 skipped |
| `pnpm run build` | **OK** · `/preview/coach-transition-editor` ○ static |
| Coverage módulo | `lib/padel/court` 99.1 % stmts / 96.96 % ramas — sin regresión vs baseline 88.6/76.6 |
| `secrets` / `SAST` / `audit_deps` | **no ejecutados** en esta pasada (0 deps nuevas, 0 `.env`, 0 superficie de red) → correr `validate-harness.js --all` antes de `/supercommitpro` |

**Archivos del fix**: 15 (10 producción + 5 test) · **Líneas**: +322 producción netas (tras −3 del refactor) / +341 test · **Dependencias nuevas**: 0 · **Migraciones**: 0 · **Endpoints**: 0.

## 5. Pendientes (no bloqueantes)

1. `node scripts/validate-harness.js --all` (secrets, SAST, audit deps, `--coverage`, `--features`, `--docs`).
2. Borrar el mockup efímero (`app/preview/coach-transition-editor/`, `components/preview/coach-transition-editor.tsx`) — el build actual lo incluye porque el encargo de validación lo exigía; `design-approved.md` §4 y `ponytail-review-report.md` §5.3 piden eliminarlo al cierre.
3. Checklist manual: manija Konva (C6), pill `md+` y sidebar colapsado (EC-5/EC-6), zoom 150 % (EC-7) — ver `acceptance-criteria.md` §6.
4. Registrar el patrón `Feature shipped sin entry-point persistente` en `.agents/patterns/recurring-issues.md` (contador 1).

## 6. Veredicto

**REPARACIÓN COMPLETA Y VERIFICADA.** Los 3 grupos (G1/G2/G3) se resolvieron en su causa raíz con 0 dependencias nuevas y 0 impacto en auth/DB/API; el único defecto real que introdujo la implementación (FAB con `position: relative` fuera del viewport, S1) fue detectado por el E2E, corregido en 1 línea y blindado con un assert geométrico. Release **v0.10** apto para merge a `rama-preview`.
