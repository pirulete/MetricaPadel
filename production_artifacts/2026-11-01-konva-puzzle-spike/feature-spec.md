# Feature Spec — Spike: Konva + Transición de Puzzle tipo PadelChess

> status: proposed
> release: spike (no productivo)
> date: 2026-11-01
> change_id: 2026-11-01-konva-puzzle-spike
> module: padel
> tags: [ui, spike, konva, canvas, padel, animation]
> loop-metrics-module: infra

> **Naturaleza del cambio**: SPIKE de validación técnica (2-4 días). No es producción de puzzles. Su entregable real es una **decisión go/no-go** (Konva/canvas vs SVG+anime.js), no código permanente.

---

## Problema

El proyecto no tiene hoy ninguna librería de canvas ni de animación instalada (verificado: sin `konva`, sin `framer-motion`, sin `anime.js`). Antes de comprometerse con un módulo de puzzles de padel (editor, formatos, backend, persistencia), el equipo necesita **probar que el camino técnico es viable**: montar Konva dentro de un App Router de Next 16 + React 19.2, animar jugadores en una cancha, dibujar trayectorias progresivas y soportar rewind, sin degradar rendimiento ni nitidez.

Riesgo principal a despejar: se sospecha que un renderizado por frame con estado de React destruiría el rendimiento, y que el SSR de Next rompería el build si el árbol de Konva no queda aislado en client-side.

## Objetivo

- Demostrar, con una demo interactiva navegable en `app/(app)/puzzle-demo`, que Konva + `react-konva` cubre la transición de puzzle: avance de paso con desplazamiento animado del jugador (300-600ms, easing in-out) + trazo progresivo de la flecha de trayectoria, y retroceso determinista al paso anterior.
- Validar el patrón de integración (client-only, coordenadas de cancha, animación por refs de nodos, no por estado de React) y documentarlo para que el módulo real lo reutilice o lo descarte con datos.
- Producir la evidencia de go/no-go: FPS, nitidez retina, comportamiento en resize, estabilidad ante toggles rápidos, peso de bundle y compatibilidad Chrome desktop / Safari iOS.

## Alcance

### In-Scope

1. **Dependencias**: `konva` + `react-konva` vía `pnpm add` (repo usa pnpm 9). Nada más para animar (sin GSAP/anime.js).
2. **Patrón de componente Konva en Next**: todo el árbol tras `"use client"`, Stage montado solo en cliente, con `next/dynamic` + `ssr: false` desde un client component contenedor para que la página no pague el bundle en entrada. Estructura propuesta en `components/court/`: `CourtStage.tsx` (Stage + responsive), `CourtLayers.tsx` (3 capas), `useCourtConfig.ts` (escala/offsets/`courtToPx`), `PuzzleDemo.tsx` (escenario y máquina de pasos).
3. **Escena de cancha base**: líneas de cancha de padel con medidas proporcionales (20 × 10 m de referencia), render estático redibujado solo en resize.
4. **Capas en orden z**: cancha (estática) → actores (4 jugadores, lo animado) → anotaciones (flechas/highlights, se dibujan y borran por paso).
5. **Modelo de coordenadas de cancha**: el escenario se define en unidades de cancha (metros), serializable (`Paso[]` con `posiciones[{x,y}]`), nunca píxeles hardcodeados. Helper `courtToPx(x, y)` aplica escala + offset.
6. **Puzzle de ejemplo con 2+ pasos** y transición animada entre ellos.
7. **Controles avanzar / retroceder paso** con animación simétrica (forward y rewind).
8. **Capa de anotaciones**: flecha de trayectoria que se dibuja progresivamente (`strokeDasharray` + `strokeDashoffset` animado).
9. **Nitidez retina**: soportar `devicePixelRatio` en el escalado de Stage.
10. **Resize sin recrear escena**: re-escalar Stage y modelo de coordenadas en respuesta al tamaño del contenedor.
11. **Accesibilidad mínima del spike**: texto alternativo del paso activo en HTML fuera del canvas (región `aria-live` o similar) para lectores de pantalla.
12. **Entrada en `FEATURES.md`** con la metadata de tracking de este change_id, marcada como spike no productivo.

### Out-of-Scope (explícito)

- **Producción de puzzles**: editor de puzzles, formatos de intercambio, backend de puzzles, carga desde DB o API. No hay endpoints ni tablas en este cambio.
- **Conexión a datos o métricas del proyecto** (evaluaciones, cursos, alumnos, rúbricas).
- **Responsive completo de producto**: se valida solo consistencia mínima de viewport (no se diseña layout de producto, no hay breakpoints de producto).
- **Multi-usuario, persistencia, sesión de puzzle, colaboración**.
- **Estilos de producto final**: no hay design pass; no se usa el sistema visual final de la app.
- **Estados de error/loading de producto**: no hay skeleton, retry ni empty-state de negocio.
- **Interacción sobre jugadores** (clicks, selección, hit regions): se documenta el riesgo, no se implementa.
- **Internacionalización**, **analytics**, **telemetría de producto**.
- **Animaciones adicionales** (fade del estado anterior es bonus, no requisito bloqueante).

---

## Decisiones ya tomadas (no re-preguntar)

| # | Decisión | Justificación |
|---|----------|---------------|
| D1 | **Konva directo** (no SVG/anime.js) | Réplica fiel de PadelChess; el equipo ya decidió el motor |
| D2 | Se instala `react-konva` además de `konva` | Exponer nodos Konva como componentes React reduce boilerplate del stage |
| D3 | **Ubicación: `app/(app)/puzzle-demo/page.tsx`** | Ruta privada autenticada, reutiliza helpers de auth para E2E; marcada como borrable tras el go/no-go |
| D4 | **Gates completos del repo** | typecheck + lint + unit (lógica pura) + 1 E2E happy path + build + coverage sin regresión >3% + FEATURES.md |
| D5 | **Excepción de gates**: sin `api-docs` y sin happy-path con SQL | El spike no tiene endpoints ni DB (documentado como excepción en este spec) |
| D6 | **AC-07 v2: bundle combinado ≤100KB gzip** | `konva` ~50KB + `react-konva` ~40KB = ~90KB; tope redondo con margen |
| D7 | **Estados de ruta permitidos: `ACTIVE` + `ADMIN`** | Demo funcional para usuarios operativos; `TEMPORARY` no aporta (spike interno); `LOCKED` nunca |
| D8 | Unit tests **solo lógica pura** | Nada de rendering Konva en jsdom (requiere canvas nativo; frágil e inútil) |

---

## Acceptance Criteria

### Del spike (técnicos)

- **AC-01 — 60fps**: la demo sostiene 60fps durante la transición (perfilado con DevTools Performance; sin long tasks amarillas prolongadas en el tramo de animación).
- **AC-02 — Nitidez retina**: en pantalla con `devicePixelRatio > 1` las líneas de cancha y el texto/anotaciones se ven nítidos (sin blur por canvas sub-escalado); el Stage escala por DPR.
- **AC-03 — Resize**: al redimensionar la ventana/contenedor, la escena se re-escala sin cortarse ni desbordar el contenedor, y **sin recrear** la escena desde cero (se conserva el paso activo).
- **AC-04 — Estabilidad ante toggles**: avanzar/retroceder 20 veces seguidas no deja nodos en posiciones intermedias ni "fantasmas"; la escena converge visualmente al paso final pedido.
- **AC-05 — Bundle combinado**: el peso incremental de `konva` + `react-konva` es **≤ 100KB gzip** combinados, cargados con dynamic import (`next/dynamic` + `ssr: false` desde un client component) y **ausentes del bundle de entrada** de `/dashboard` y de la home. Medición con `@next/bundle-analyzer` o gate de bundle en el día 4.
- **AC-06 — Compatibilidad**: la demo funciona en Chrome desktop y Safari iOS; el touch scroll sobre el canvas **no secuestra** el gesto del navegador en una página scrolleable.
- **AC-07 — Estado serializable**: el estado del puzzle (paso activo + escenario) es data serializable (hoy hardcodeada) y podría cargarse desde backend mañana sin tocar la escena. Reversible vía JSON.

### Del repo (obligatorios)

- **AC-08 — Unit tests (lógica pura)**: Jest en `tests/unit/` para: `courtToPx`/cálculo de escala y offsets, máquina determinista de pasos N→M, cálculo de `strokeDashoffset` progresivo, y clamp de índice (0..N). Sin rendering de Konva en jsdom.
- **AC-09 — E2E happy path**: al menos 1 test Playwright navegable en `tests/e2e/` que autentica con helpers existentes, abre `/puzzle-demo`, pulsa "Siguiente paso" y verifica el cambio de paso visible (incluye el texto alternativo del paso activo como aserción accesible).
- **AC-10 — Gates**: `typecheck` (0 errores TS), `lint` (0 errores ESLint), `build` (`next build` exitoso) y `coverage` sin regresión >3% vs `.validation/coverage-baseline.json`.
- **AC-11 — `FEATURES.md`**: entrada nueva con metadata (`status`, `release`, `module`, `tags`, `change_id`, `date`), problema, solución, archivos modificados y tests, marcada como spike no productivo/borrable.
- **AC-12 — Ruta privada declarada**: `/puzzle-demo` declara explícitamente estados permitidos (`ACTIVE` + `ADMIN`, nunca `LOCKED`) y usa el patrón de guard de rutas privadas del repo; además expone el texto alternativo del paso activo accesible fuera del canvas.
- **AC-13 — Excepción documentada**: se registra en el artifact que este change no toca `lib/api-docs/spec.ts` ni requiere happy-path con SQL, por no tener endpoints ni DB, para evitar un falso negativo del gate.

---

## Edge Cases

| # | Caso | Comportamiento esperado |
|---|------|-------------------------|
| E1 | **Salto de múltiples pasos (0→3)** | Determinista: el resultado final es idéntico al de avanzar 0→1→2→3. Se llama `Konva.Node.stop()` (o se destruye el tween) en cada nodo antes de lanzar el tween al paso destino. Sin nodos intermedios residuales. |
| E2 | **Desmontaje a mitad de tween** | `cleanup` en `useEffect` detiene/destruye todos los tweens activos; sin warnings de "node destroyed while tweening" ni memory leak entre montajes. |
| E3 | **Resize con tween activo** | El resize no cancela la animación de forma inconsistente: o se recalcula el destino en la nueva escala, o se hace snap determinista al paso activo. Nunca queda el nodo en coordenadas de la escala anterior. |
| E4 | **Clamp de índice** | El índice de paso está acotado a `0..N`; "anterior" en el paso 0 y "siguiente" en el último paso son no-ops (botón deshabilitado, sin tween). |
| E5 | **Mount con contenedor de 0px** | Si el ancho inicial es 0 (contenedor oculto o sin layout), el Stage no queda en 0px permanente: se dimensiona en el primer effect/`ResizeObserver` y la escena aparece correctamente. |
| E6 | **Touch scroll en iOS** | Un swipe vertical sobre el canvas hace scroll de la página; Konva no captura el gesto (sin `preventDefault` agresivo). |
| E7 | **Racha de toggles rápidos** | 20+ alternancias rápidas terminan en el estado del último comando, sin parpadeos de posición ni acumulación de tweens. |
| E8 | **DPR cambia en caliente** (mover ventana entre monitores) | La escena se re-renderiza nítida; como mínimo no rompe el layout del Stage. |
| E9 | **Navegación fuera y vuelta a `/puzzle-demo`** | La escena se monta limpia en el paso inicial; no hay listeners (`ResizeObserver`) duplicados del montaje anterior. |
| E10 | **Provocado: usuario `TEMPORARY`/`LOCKED`** | No accede a `/puzzle-demo` (redirección/denegación según el patrón del repo); `LOCKED` nunca permitido. |
| E11 | **`react-konva` incompatible con React 19.2** | Si la versión instalada falla, se documenta y se resuelve con wrapper propio sobre `konva` puro; el spike no se considera bloqueado por la capa React. |

---

## Riesgos

| Riesgo | Severidad | Mitigación |
|--------|-----------|------------|
| SSR de Next rompe el build por import de Konva en Server Component | Alta | Todo el árbol tras `"use client"`; import vía `next/dynamic` con `ssr: false` desde contenedor client |
| Re-render por frame por animar desde estado React | Alta | Estado React solo para paso activo / escenario / flags; animación exclusivamente vía refs a nodos Konva |
| `react-konva` incompatible con React 19.2 | Media | Verificar versión antes de instalar (D2/E11); fallback a `konva` puro |
| Canvas como caja negra para accesibilidad | Media | Texto alternativo del paso activo en HTML accesible fuera del canvas (mínimo del spike) |
| Touch scroll secuestrado en iOS | Media | No capturar gestos DOM sobre el canvas; validar en Safari iOS real/simulado |
| Canvas en 0px al montar | Media | Dimensionar antes del primer render válido o en effect inicial + `ResizeObserver` |
| Bundle carga en la entrada y penaliza home/dashboard | Media | Dynamic import + verificación con bundle analyzer (AC-05) |
| El spike se "produccionaliza" sin decisión | Baja | Ruta y componentes marcados como borrables; decisión go/no-go obligatoria al cierre |

## Dependencias

- **Nuevas**: `konva` (v9.x, verificar compatibilidad), `react-konva` (compatible con React 19.2). Dev/medición: `@next/bundle-analyzer` (solo si no está ya disponible como herramienta de build).
- **Existentes**: Next 16.1.6, React 19.2.0, TypeScript 5.8, pnpm 9, Playwright (E2E), Jest (unit), helpers de auth para E2E, `scripts/validate-harness.js`.
- **Referencia externa**: konvajs.org (docs API/tweening), padelchess.me (comportamiento de transición).
- **Sin dependencias de DB ni de API.**

## Metadata de Tracking

```
change_id: 2026-11-01-konva-puzzle-spike
status:    proposed   (→ in-progress al iniciar implementación → released al cerrar con go/no-go)
release:   spike (no productivo)
date:      2026-11-01
module:    padel
tags:      [ui, spike, konva, canvas, padel, animation]
loop-metrics module: infra
```
