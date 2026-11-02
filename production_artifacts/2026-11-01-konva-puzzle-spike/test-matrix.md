# Test Matrix — Spike Konva + Transición de Puzzle

> change_id: `2026-11-01-konva-puzzle-spike`
> fecha: 2026-11-01 · validador: @qa-release
> Alcance: unit (lógica pura) + E2E navegable. Sin rendering de Konva en jsdom (D8 de la spec) y sin tests de API/DB (AC-13: no hay endpoints).

---

## 1. Resumen

| Tipo | Archivos | Tests | Comando | Resultado |
|---|---|---:|---|---|
| Unit (Jest) | 3 | **38** | `pnpm run test:unit` | ✅ 750/750 (60 suites) |
| E2E (Playwright) | 1 | **2** | `npx playwright test tests/e2e/puzzle-demo.spec.ts` | ✅ 2/2 passed |
| API | 0 | 0 | — | **N/A** (AC-13, sin endpoints) |
| Cobertura | `lib/padel/court/` | — | `jest --coverage` | ✅ 100% del módulo nuevo |

Masa de pruebas del repo: 750 tests / 60 suites — todos verdes, sin regresión de suite.

Entorno de ejecución verificado: server en `localhost:3000`, DB en `localhost:5434` (E2E con usuario sembrado y limpiado por `beforeAll`/`afterAll`).

---

## 2. Unit tests — `tests/unit/padel/`

Entorno Jest `node`, sin `canvas` nativo: sólo se prueban los módulos puros de `lib/padel/court/` (regla D8). `jest.config.js` recolecta cobertura de `lib/**/*.ts`, por lo que estos tests **suman** cobertura; no hay archivo nuevo sin cubrir.

### 2.1 `court-geometry.test.ts` — 14 tests (`lib/padel/court/geometry.ts`)

| # | Test | Cubre | Qué asevera |
|---:|---|---|---|
| 1 | usa la dimensión limitante (min de ambos ejes por metro) | AC-08, AC-03 | `computeScale` toma el mínimo de `w/20` y `h/10` |
| 2 | mantiene el aspect ratio 2:1 al pasar a píxeles | AC-02, AC-08 | cancha 20:10 nunca se deforma al escalar |
| 3 | **E5**: viewport 0×0, negativo o NaN → 0 sin NaN/Infinity | E5 | contenedor sin layout no produce estado inválido |
| 4 | viewport con el mismo aspect no deja margen | AC-03 | offset 0 cuando el contenedor ya es 2:1 |
| 5 | viewport más ancho centra la cancha en X | AC-03 | letterbox horizontal simétrico |
| 6 | viewport más alto centra la cancha en Y | AC-03 | letterbox vertical simétrico |
| 7 | **E5**: viewport degenerado da offsets finitos | E5 | sin `Infinity` en resize con 0px |
| 8 | (0,0) y (20,10) caen en las esquinas del viewport | AC-08, AC-07 | `courtToPx` mapea extremos del modelo de cancha |
| 9 | respeta los offsets del letterbox | AC-03, AC-08 | conversión `offset + punto*escala` |
| 10 | el centro de la cancha se mapea al centro del área escalada | AC-08 | coherencia espacial del modelo |
| 11 | **E5**: coordenadas no finitas no generan NaN | E5 | robustez ante data corrupta |
| 12 | normaliza al rango [1, MAX_DPR] | AC-02 | DPR 0/negativo/NaN → 1; techo 4 |
| 13 | multiplica ambos ejes por el mismo DPR: el aspect no cambia | AC-02 | nitidez retina sin deformar |
| 14 | DPR inválido cae a 1 y no produce NaN | AC-02, E8 | canvas nunca con tamaño inválido |

### 2.2 `court-steps.test.ts` — 12 tests (`lib/padel/court/steps.ts`)

| # | Test | Cubre | Qué asevera |
|---:|---|---|---|
| 15 | acota índices negativos a 0 | AC-08, E4 | "anterior" en paso 0 es no-op |
| 16 | acota índices fuera de rango a `totalSteps-1` | AC-08, E4 | "siguiente" en último paso es no-op |
| 17 | deja pasar índices válidos y trunca decimales | AC-08 | clamp usable como índice de array |
| 18 | `totalSteps <= 0` o inválido → 0 | E5 | escenario vacío no rompe |
| 19 | **E4**: en el último paso, siguiente y anterior no se salen del array | E4 | simetría de los dos extremos |
| 20 | salto 0→3 recorre el mismo path que componer 0→1→2→3 | E1, AC-08 | determinismo del salto múltiple |
| 21 | el estado final del salto largo y el de los pasos unitarios coinciden | E1, E7 | convergencia a raíz de rachas de toggles |
| 22 | es determinista: misma entrada → mismo resultado | AC-08 | sin aleatoriedad ni estado oculto |
| 23 | hacia atrás recorre los pasos en orden inverso | forward/rewind | simetría rewind |
| 24 | no-op cuando `from === to` | E4/E7 | evita tweens innecesarios |
| 25 | valores no finitos se tratan como 0 | E5 | robustez |
| 26 | `isSameStep` compara índices truncados | AC-08 | helper de corte de transición |

### 2.3 `court-annotation.test.ts` — 12 tests (`lib/padel/court/annotation.ts`)

| # | Test | Cubre | Qué asevera |
|---:|---|---|---|
| 27 | progress 0 → trazo oculto (`dashOffset = totalLength`) | AC-08, AC-07 | estado inicial del trazo progresivo |
| 28 | progress 1 → trazo completo (`dashOffset = 0`) | AC-08 | estado final de la flecha |
| 29 | forward es monótono decreciente de `length` a 0 | AC-08 | el trazo "se dibuja" sin retrocesos |
| 30 | backward es simétrico: crece de 0 a `length` | AC-08 | rewind borra la flecha simétricamente |
| 31 | forward y backward son complementarios en el mismo progreso | AC-08 | `offsetForward + offsetBackward = length` |
| 32 | acota el progreso al rango [0, 1] | AC-07 | progreso fuera de rango no rompe |
| 33 | `length` 0 o inválido no produce NaN | E5 | tramo degenerado seguro |
| 34 | convierte los extremos a píxeles y calcula la longitud | AC-07 | geometría derivada del escenario serializable |
| 35 | calcula la longitud euclídea de un tramo diagonal | AC-08 | `hypot` correcto |
| 36 | misma cancha + mismo viewport → mismo resultado (repetible) | AC-07 | determinismo (redibujable desde JSON) |
| 37 | **el escenario es serializable**: round-trip JSON no cambia la flecha | **AC-07** | el estado del puzzle sobrevive `JSON.parse(JSON.stringify())` |
| 38 | **E5**: viewport 0×0 no produce NaN ni Infinity | E5 | montaje con contenedor oculto |

---

## 3. E2E — `tests/e2e/puzzle-demo.spec.ts` (2 tests)

Sembrado con `pg` + `bcryptjs` (`INSERT ... ON CONFLICT`), login real por formulario, limpieza en `afterAll`.

| # | Test | Cubre | Qué verifica |
|---:|---|---|---|
| E1 | sin sesión redirige a `/login` | **AC-12**, E10 | `/puzzle-demo` sin sesión nunca renderiza la demo (LOCKED jamás permitido) |
| E2 | usuario ACTIVE navega los pasos con `aria-live` | **AC-09**, AC-12, E4 | abre la ruta autenticado; `aria-live` = "Paso 1"; "Siguiente paso" → "Paso 2" y "Paso anterior" se habilita; "Paso anterior" → "Paso 1" y se deshabilita en el extremo |

Nota de cobertura accesible: la aserción principal es **sobre el texto alternativo HTML fuera del canvas** (`p[aria-live="polite"]`), que es exactamente lo que AC-12 exige como sustituto accesible del canvas. Los botones se localizan por `getByRole("button", { name })`, no por selector CSS.

---

## 4. Mapa AC → test

| AC | Cobertura automatizada | Estado |
|---|---|---|
| AC-01 60fps | — (arquitectura verificada por lectura; perfilado manual) | 🔶 D4 |
| AC-02 retina | #12, #13, #14 (cálculo DPR) + lectura de `setPixelRatio` | 🔶 D4 visual |
| AC-03 resize | #1, #4, #5, #6, #7, #9 | ✅ cálculo · 🔶 visual |
| AC-04 toggles | #20, #21, #24 | 🔶 D4 visual |
| AC-05 bundle | — | 🔶 D4 (`ANALYZE=true pnpm build`) |
| AC-06 plataformas | — (mitigación `listening={false}` + `pointerEvents:none`) | 🔶 D4 Safari iOS |
| AC-07 serializable | #37 (+ #8, #34, #36) | ✅ |
| AC-08 unit puros | 38 tests | ✅ |
| AC-09 E2E happy | E2 | ✅ |
| AC-10 gates | typecheck/lint/build/unit verdes; coverage ⏳ harness | ✅ / ⏳ |
| AC-11 FEATURES.md | — (verificado por lectura) | ✅ |
| AC-12 ruta privada + a11y | E1, E2 | ✅ |
| AC-13 excepción API | — (`git diff lib/api-docs` vacío) | ✅ |

---

## 5. Huecos conocidos (aceptados)

| Hueco | Motivo | Mitigación |
|---|---|---|
| Sin test de rendering Konva en jsdom | Requiere `canvas` nativo; frágil e inútil (D8) | E2E real en navegador |
| Sin test automatizado de `TEMPORARY` → `/dashboard` ni `LOCKED` | El E2E sólo cubre "sin sesión" | Guard explícito en `page.tsx:17` + paso manual en `acceptance-criteria.md` §2.6 |
| Sin test de FPS / bundle / Safari iOS | No automatizable en este repo | Checklist manual D4 con criterio numérico |
| Sin happy-path con SQL | No hay endpoints ni DB (AC-13) | Excepción documentada |

---

## 6. Comandos de reproducción

```bash
pnpm run test:unit -- --testPathPattern="court-"        # 38 tests unit del spike
npx playwright test tests/e2e/puzzle-demo.spec.ts       # 2 tests E2E (requiere server + DB)
ANALYZE=true pnpm build                                 # AC-05 (ver BUG-01: falta script "analyze")
```
