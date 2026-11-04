# Design Exploration — Fix "Editor de Transiciones" (v2)

> change_id: `2026-11-03-fix-problems` · feature origen: `2026-11-02-coach-transition-editor` · date: 2026-11-03 · owner: @ui-designer
> Contexto: el usuario (cuenta ADMIN) no encontró el editor y, al encontrarlo, no entendió el flujo.
> Decisiones cerradas por el usuario (NO re-abrir): **entry point = A3 FAB flotante** (manteniendo el CTA del dashboard) · **mockup navegable = SÍ**.

---

## 0. Diagnóstico (por qué falla hoy)

| Problema reportado | Causa raíz UI | Evidencia en código |
|---|---|---|
| "No encuentro cómo entrar" | El único acceso es un `Button variant="outline"` titulado "Transiciones" (sustantivo, no acción) en el header del dashboard, compitiendo con "Evaluar ahora" (primario). Sin entry point persistente en el resto de rutas. | `teacher-dashboard.tsx` L56-63 |
| "No entiendo cómo se usa" | El flujo (paso → mover → tiro → probar → guardar) no está **representado**; sólo hay pistas fragmentadas bajo el canvas. Los gestos son implícitos (seleccionar antes de arrastrar). "Probar" y "Guardar" parecen lo mismo. | `context-bar.tsx` L83-94, L161-173; `step-filmstrip.tsx` L4 (chips sin explicación) |

---

## A. FAB A3 — especificación definitiva

### A.1 Posición y geometría

| Propiedad | Mobile (375 px) | `md+` |
|---|---|---|
| `position` | `fixed` | `fixed` |
| `right` | `1rem` (`right-4`) | `1.5rem` (`md:right-6`) |
| `bottom` | `calc(4.75rem + env(safe-area-inset-bottom))` → **≈76 px**, deja 15 px libres sobre `BottomNav` (alto real ≈61 px) | `md:bottom-6` (nav no existe en desktop) |
| Tamaño | **56×56 px** (`size-14`, supera el mínimo 48 y el ≥54 pedido) | 56 px de alto; **pill extendida** `h-14 px-5` con texto |
| Radio | `rounded-full` | `rounded-full` |
| Elevación | `shadow-lg` (+ `shadow-primary/20`) | igual |
| `z-index` | `z-40` (por encima del contenido, por debajo de `Dialog`/`Sheet` = `z-50`) | igual |

**Verificación de solape**: el repo **no tiene ningún otro FAB** (búsqueda de `fixed bottom-*`: sólo `bottom-nav.tsx`). El editor oculta el `BottomNav` (`FOCUS_MODE_ROUTES`), y el FAB también se oculta ahí → sin colisión posible. No hay FABs de admin con los que chocar.

### A.2 Visibilidad por ruta

| Ruta | FAB | Motivo |
|---|---|---|
| `/dashboard` | ✅ | Home del coach; donde el usuario lo buscó primero |
| `/cursos`, `/cursos/[id]` | ✅ | Contexto de clase: "prepara la jugada de hoy" |
| `/evaluar` | ✅ | Flujo de trabajo del coach, mismo lienzo mental |
| `/historial` | ✅ | Acción transversal |
| `/academias`, `/academias/[id]` | ✅ | — |
| `/transiciones` | ❌ | Ya hay botón "Nueva" en el header de la biblioteca (`transition-library.tsx` L66-70) → duplicar sería ruido |
| `/transiciones/nueva`, `/transiciones/[id]` | ❌ | **Modo foco**: el FAB taparía la barra contextual y el lienzo |
| `/admin/**`, `/admin/platform/**` | ❌ | Back-office: acciones tabulares propias, el FAB no aporta |
| `/settings` | ❌ | Superficie de configuración, no de trabajo |
| Rol `USER` | ❌ | El editor es `validateAdmin`; nunca mostrar acción que dará 403 |

Implementación sugerida (1 condición, sin componente nuevo): en `AppLayoutClient` —
`role === "ADMIN" && !FOCUS_MODE_ROUTES.some(r => r.test(pathname)) && !/^\/(transiciones|settings|admin)/.test(pathname)`.

### A.3 Contenido y semántica

- **Icono**: `Route` (lucide) — semántica de "secuencia de pasos", no de "lista".
- **Label mobile**: icon-only + **`aria-label="Crear transición"`** + `title` nativo.
- **Label `md+`**: pill extendida `Route · Nueva transición` (descubribilidad en desktop, donde el espacio sobra).
- **Destino**: `href="/transiciones/nueva"` en **1 toque** (sin speed-dial: una sola acción, menos fricción y menos estados de error).
- **Primera vez**: `Badge` puntual (punto `size-2`) la primera sesión, dismissible al primer tap (localStorage `padel.transitionFab.seen`).
- **Accesibilidad**: `focus-visible:ring-2 ring-ring ring-offset-2`, target 56 px, nombre accesible no depende del icono.

### A.4 Wireframe — dashboard con FAB (375×667)

```
┌───────────────────────────────────────────┐ 375
│ ‹Header notificaciones›        🔔  CR     │ 56
├───────────────────────────────────────────┤
│ Viernes 20 sep                            │
│ Hola, coach                               │
│ Resumen de tu actividad                   │
│ ┌───────────────┐ ┌─────────────────────┐ │
│ │ Transiciones  │ │ Evaluar ahora       │ │ ← CTA actual SE MANTIENE
│ └───────────────┘ └─────────────────────┘ │
│                                           │
│ ┌─────────┬─────────┬─────────┐           │
│ │ 24      │ 38      │ 7.8     │           │
│ │ Alumnos │ Evalua. │ Promedio│           │
│ └─────────┴─────────┴─────────┘           │
│                                           │
│ Mis cursos                    + Nuevo     │
│ ┌───────────────────────────────────────┐ │
│ │ Iniciación Lunes · 12 alumnos         │ │
│ ├───────────────────────────────────────┤ │
│ │ Intermedio Miércoles · 8 alumnos      │ │
│ └───────────────────────────────────────┘ │
│                                           │
│                              ╭─────────╮  │
│                              │  ➜      │  │ ← FAB 56 px
│                              ╰─────────╯  │   bottom:76px, right:16
│                                           │
├───────────────────────────────────────────┤
│ Inicio Cursos Acad. Eval. Hist. Admin Perf│ 61  (7 items, sin 8.º)
└───────────────────────────────────────────┘ 667
```

---

## B. Onboarding del editor — 3 alternativas

### O1 · Strip de flujo persistente (1→5) + hints contextuales

```
┌───────────────────────────────────────────┐
│ ← [ Mi jugada de saque          ] ⟳       │
│ ①Paso  ②Mueve  ③Tiro  ④Prueba  ⑤Guarda   │ ← strip, chip activo en primary
│ ┌───────────────────────────────────────┐ │
│ │  ╭─────── hint flotante ───────╮      │ │
│ │  │ 👆 Toca un jugador para moverlo │   │ │ ← visible si selected=null
│ │  ╰──────────────────────────────╯      │ │
│ │                                       │ │
│ │            ░░░ CANCHA ░░░             │ │ 300–54vh
│ │        ●───────arc────────▶●          │ │
│ │        ◉ manija del arco              │ │
│ │                                       │ │
│ └───────────────────────────────────────┘ │
│ Pasos · 3  [+ Añadir]      [Colapsar ▾]   │ ← filmstrip con subtítulo
│ [1][2][3] [+]                             │
│ ← Mover  Mover →  [⧉] [🗑]                │
│ ┌───────────────────────────────────────┐ │
│ │ 👤 Jugador A · Paso 2   ±0,5 m        │ │
│ │ [←][↑][↓][→] │ [◎ Fijar] [🗑 Quitar]  │ │
│ │ ↶ ↷  ● cambios sin guardar            │ │
│ │                      [▶ Probar] [✓Guardar]│
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

- **Pros**: siempre visible → resuelve "no sé qué sigue"; cero estado extra (deriva de `steps/selected/dirty/previewing`); sin `localStorage`; funciona en desktop y mobile; el hint cambia de paso solo.
- **Cons**: ~28 px verticales extra a 375×667 (el canvas baja de 54vh a ~50vh); puede leerse como decoración tras la 10.ª vez → mitigación: el strip colapsa a "Paso 2 de 5 · Tiro" en una línea al primer guardado.

### O2 · Coach-mark de primera vez sobre el lienzo (3 callouts)

- **Pros**: enseña el gesto **exactamente** donde ocurre; alto impacto la primera vez; no ocupa espacio permanente.
- **Cons**: interrumpe/bloquea taps; sólo aparece una vez (si se salta, el problema vuelve); requiere `localStorage` + estado de paso; mal en desktop (el flujo no es gestual); 3 modales encadenados se sienten pesados en una herramienta de uso diario.

### O3 · Panel de ayuda colapsable ("¿Cómo funciona?") en la cabecera

- **Pros**: cero intrusión; espacio para explicar Probar vs Guardar con detalle; reutiliza `Dialog`/`Card`.
- **Cons**: **no resuelve el problema reportado** (es passivo: el usuario que no entiende no abre la ayuda); añade un control más a la cabecera ya cargada (← + input + spinner).

### Tabla comparativa

| Criterio | O1 Strip persistente | O2 Coach-mark 1ª vez | O3 Ayuda colapsable |
|---|---|---|---|
| Resuelve "no sé el siguiente paso" | ✅ alto | 🟡 sólo la 1.ª vez | ❌ |
| Coste de espacio (375×667) | 🟡 +28 px | ✅ 0 permanente | ✅ 0 |
| Estado nuevo a persistir | ✅ ninguno | ❌ `localStorage` + índice | 🟡 abierto/cerrado |
| Enseña el gesto táctil | 🟡 vía hint contextual | ✅ directo | ❌ |
| Desktop | ✅ | 🟡 | ✅ |
| Esfuerzo de implementación | 🟡 1 componente presentacional | ❌ 1 overlay + persistencia | 🟡 1 Dialog |
| Riesgo de molestar en uso diario | 🟡 | ❌ alto | ✅ bajo |
| Reutiliza UI kit | ✅ `Badge` + `Button` | 🟡 `Card` + overlay custom | ✅ `Dialog` |

### ✅ Recomendación: **O1 (strip persistente + hint contextual)** + O3 como "?" discreto (opcional, fase 2)

**Por qué**: el problema no es "la primera vez", es **cada vez** — el usuario probó y no entendió. O1 mantiene el modelo mental visible mientras edita y deriva su estado del documento (0 estado nuevo, 0 persistencia, 0 dependencias). El hint contextual sustituye la pista enterrada en la barra inferior, resolviendo el gesto implícito en el punto de acción. O2 queda descartado como mecanismo principal (bloquea y sólo educa una vez); O3 se admite únicamente como icono `CircleHelp` en la cabecera que abre un `Dialog` con los 5 pasos y la diferencia Probar/Guardar.

---

## C. Copy y affordance (cambios concretos)

| Zona | Hoy | Propuesto | Motivo |
|---|---|---|---|
| CTA dashboard | "Transiciones" | **"Preparar jugada"** (o "Mis jugadas") | Verbo de acción, no sustantivo ambiguo |
| FAB | — | `aria-label="Crear transición"` · pill "Nueva transición" | Descubribilidad |
| Strip | — | `① Paso · ② Mueve · ③ Tiro · ④ Prueba · ⑤ Guarda` (activo: "③ Tiro — coloca el golpe") | Flujo explícito |
| Probar | "Probar" | **"Probar"** + `aria-describedby`: "Reproduce la jugada en memoria · no guarda" | Distingue de Guardar |
| Guardar | "Guardar" | **"Guardar"** → post-save **"Guardado ✓"** (2 s) | Feedback de persistencia |
| Estado doc | "sin guardar" / "guardado" | **Badge** `● Cambios sin guardar` / `✓ Guardado` con color `primary`/`muted` | Estado legible de un vistazo |
| Filmstrip | "Pasos · 3" | **"Secuencia · 3 pasos"** + subtítulo "Cada paso es una foto de la jugada" | Explica qué es un paso |
| Mover | "← Mover" / "Mover →" | **"← Antes" / "Después →"** | Evita "¿mover qué?" |
| Añadir paso | icono `+` solo | `+ Añadir paso` (texto en `md+`, `aria-label` siempre) | Afordance |
| Manijas arco | círculo sin icono | anillo `strokeWidth` 3 + punto central + hint **"Arrastra el arco para curvar el tiro"** (1.ª vez por paso) | Gesto invisible hoy |
| Canvas sin selección | "Toca un jugador en la cancha" (abajo) | Badge flotante **"Toca un jugador para moverlo"** + `role="status"` | Pista en el punto de acción |
| Paso sin tiro | — | Badge "Sin tiro · toca ◎ para fijarlo" | Cierra el paso ③ |

---

## D. Estados cubiertos (implementación + mockup)

| Estado | Disparador | UI |
|---|---|---|
| **Primera vez sin pasos** | `steps.length === 0` | Strip con ① activo + `EmptyState` "Crea tu primer paso" + FAB visible en dashboard |
| **Sin selección** | `selected === null` | Hint flotante sobre canvas; nudges/tiro `disabled`; contexto "Toca un jugador" |
| **Seleccionado** | `selected !== null` | Hint desaparece; "Jugador A · Paso 2 ±0,5 m"; tiro habilitado |
| **Dirty** | `canUndo(history) \|\| título ≠ savedTitle` | Badge `● Cambios sin guardar`, punto en chip activo, `beforeunload` |
| **Guardado OK** | tras `create/update` | Toast "Transición guardada", botón "Guardado ✓" 2 s, badge `✓ Guardado`, strip avanza a ⑤ |
| **Preview (Probar)** | `previewing` | Cinta "Reproduciendo paso 2 de 5", strip marca ④, botón "Detener" |
| **Error guardar** | respuesta no-OK | Toast `destructive` + botón vuelve a "Guardar" (dirty se mantiene) |
| **Loading / error de biblioteca** | `/transiciones` | Ya cubiertos por `TransitionLibrary` (no se toca) |

### Wireframe — primera vez sin pasos (375×667)

```
┌───────────────────────────────────────────┐
│ ← [ Mi primera transición      ] ⟳        │
│ ①Paso  ②Mueve  ③Tiro  ④Prueba  ⑤Guarda   │
│ ┌───────────────────────────────────────┐ │
│ │  👆 Toca un jugador para moverlo      │ │
│ │                                       │ │
│ │           ░░ CANCHA VACÍA ░░          │ │
│ │        ●     ●     ●     ●            │ │
│ │                                       │ │
│ └───────────────────────────────────────┘ │
│ ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ │
│   Aún no hay pasos                        │
│   Añade el primero para colocar           │
│   jugadores y dirigir el tiro.            │
│            [ + Añadir paso ]              │
│ └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘ │
│ ┌───────────────────────────────────────┐ │
│ │ Toca un jugador en la cancha          │ │
│ │ [←][↑][↓][→] (disabled) [◎] [🗑]      │ │
│ │ ↶ ↷  ✓ Guardado     [▶ Probar][Guardar]│ │
│ └───────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

### Responsive

| Breakpoint | FAB | Strip | Filmstrip | ContextBar |
|---|---|---|---|---|
| 375 (mobile) | icon-only 56 px, `bottom 76px` | 5 chips, labels en 1 palabra, scroll horizontal si hace falta | bajo canvas, colapsable | fija abajo, iconos only |
| 640–767 (sm) | icon-only | labels completas | bajo canvas | iconos + textos cortos |
| ≥768 (`md`) | pill extendida | completa, `sticky` bajo la cabecera | aside derecho 190 px | labels completas |

---

## E. Riesgos aceptados

1. **El strip ocupa 28 px** → a 375×667 el canvas queda en ~50vh (sigue dentro del AC-01: canvas completo visible). Mitigación: colapsa a 1 línea tras el primer guardado.
2. **FAB y CTA del dashboard coexisten** → decisión del usuario (A3). Se diferencian por jerarquía (FAB flotante `primary` vs CTA `outline`/`default`); no compiten en el mismo plano visual.
3. **`localStorage` sólo para `padel.transitionFab.seen`** (punto de novedad) — si falla, no rompe nada (fallback: siempre visible).
