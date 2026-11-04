# Design Approved — Fix "Editor de Transiciones"

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor` · date: 2026-11-03 · owner: @ui-designer
> Estado: **pendiente de confirmación del usuario** (checklist abajo). Nada de esto modifica lógica de negocio.

---

## 1. Decisiones ya cerradas por el usuario (no re-abrir)

| Decisión | Estado |
|---|---|
| Entry point = **A3 · FAB flotante** para ADMIN, manteniendo el CTA actual del dashboard | ✅ Aprobado |
| Mockup navegable (`components/preview/coach-transition-editor.tsx`) | ✅ Aprobado y entregado |

## 2. Recomendación pendiente de visto bueno

| # | Propuesta | Recomendación | Artifact |
|---|---|---|---|
| D1 | **Onboarding O1**: strip de flujo persistente `①Paso ②Mueve ③Tiro ④Prueba ⑤Guarda` (colapsa a 1 línea tras el primer guardado) | ✅ Recomendado (vs O2 coach-mark, descartado; O3 ayuda, sólo fase 2) | `design-exploration.md` §B |
| D2 | **Hint contextual** sobre el lienzo ("Toca un jugador para moverlo" / "Arrastra el arco para curvar el tiro") | ✅ Recomendado (sustituye la pista enterrada del `ContextBar`) | §B, §C |
| D3 | **Copy**: "Transiciones" → "Preparar jugada"; "Probar" vs "Guardar" con microcopy "en memoria / en tu biblioteca"; "Pasos" → "Secuencia · N pasos"; "← Mover/Mover →" → "← Antes / Después →" | ✅ Recomendado | §C |
| D4 | **Badge de estado** `● Cambios sin guardar` / `✓ Guardado` en la barra contextual | ✅ Recomendado | §C, §D |
| D5 | **FAB**: 56 px, `right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]`, pill extendida en `md+`, icono `Route`, `aria-label="Crear transición"`, 1 toque a `/transiciones/nueva` | ✅ Recomendado | §A |
| D6 | **Visibilidad del FAB**: `/dashboard`, `/cursos`, `/cursos/[id]`, `/evaluar`, `/historial`, `/academias`, `/academias/[id]` · **oculto** en `/transiciones*`, `/settings`, `/admin/**` y para `USER` | ✅ Recomendado | §A.2 |
| D7 | **O3 fase 2**: icono `CircleHelp` en la cabecera que abre `Dialog` "¿Cómo funciona?" | ⏳ Opcional, no bloquea | §B |

## 3. Checklist de aprobación (para que el usuario confirme)

- [ ] **D5/D6 — FAB**: 56 px, flotante abajo-derecha, visible sólo para ADMIN y sólo en rutas de trabajo; nunca en el editor (modo foco) ni en `/transiciones` (allí ya existe "Nueva").
- [ ] **D1 — Strip**: los 5 pasos visibles permanentemente sobre el lienzo; el chip activo se resalta solo según el estado; colapsa tras el primer guardado.
- [ ] **D2 — Hints**: "Toca un jugador…" cuando no hay selección y "Arrastra el arco…" cuando hay jugador seleccionado con tiro.
- [ ] **D3 — Copy**: se acepta el cambio de "Transiciones" → "Preparar jugada" y la distinción Probar (memoria) vs Guardar (biblioteca).
- [ ] **D4 — Badge**: `● Cambios sin guardar` / `✓ Guardado` reemplaza el texto plano actual.
- [ ] **Mockup**: validado en `components/preview/coach-transition-editor.tsx` (5 pantallas).

## 4. Condiciones de aceptación para implementación (@app-engineer)

- Cero dependencias nuevas; cero componentes `ui/*` nuevos.
- FAB montado en `AppLayoutClient` (ya conoce `role` y `pathname`) — no duplicar en cada página.
- `BottomNav` intacto: **7 items máximo** a 375 px.
- Target mínimo 44×44 px; FAB 56 px; `focus-visible:ring-2`.
- Sólo CSS vars de `app/globals.css` + `COURT_COLORS`; ningún hex nuevo.
- El strip no cambia `editor-screen` state: se deriva de `steps.length`, `selected`, `dirty`, `previewing`.
- `AlertDialog` de salida (EC-11) y `beforeunload` se conservan.
- El mockup se elimina al cerrar la implementación.

## 5. Riesgos aceptados

1. Strip consume ~28 px de alto a 375×667 (canvas ~50vh, sigue cumpliendo AC-01).
2. FAB + CTA del dashboard coexisten por decisión del usuario; jerarquía distinta (flotante primario vs CTA `outline`).
3. `localStorage` sólo para el punto de novedad del FAB (`padel.transitionFab.seen`); si falla, el FAB se muestra igual.
