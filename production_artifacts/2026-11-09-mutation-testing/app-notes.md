# App Notes — Mutation testing con Stryker (v0.13)

> change_id: `2026-11-09-mutation-testing` · module: `infra` · autor: @app-engineer
> spec: `technical-design.md` §2–§5 + `technical-design-v2.md` (B1/M1/M2/M3/N2/N3/N4) + `change-map.md` §1/§7.1

---

## Chunk 1 — Config, scripts y test de `dispatch`

### Archivos (6 asignados + 1 ajuste mínimo justificado)

| # | Archivo | Acción | Notas |
|---|---|---|---|
| 1 | `stryker.conf.mjs` | crear | `mutate` = 14 archivos del scope; `ignorePatterns` = lista cerrada de 15 patrones (B1); `cleanTempDir: "always"` (M3); `concurrency: 1`; `thresholds` placeholder `{high:100,low:0,break:0}` (AC-05); sin `// @ts-check` ni `@type` (N3); reporters `html/clear-text/progress/json` |
| 2 | `jest.config.mutation.js` | crear | Derivada de `jest.config.js` sin coverage/verbose; `testTimeout: 60_000`; `testMatch` acotado; excluye `motor-torneo/purity.test.ts` |
| 3 | `package.json` | editar | +2 scripts (`test:mutation`, `test:mutation:phase-b`) +4 devDeps (3× `@stryker-mutator/*@10.1.1` + `jest-environment-node@^30.4.1`) |
| 4 | `.gitignore` | editar | +3 líneas: comentario, `reports/mutation/`, `.stryker-tmp-*/` |
| 5 | `tests/unit/torneos/dispatch.test.ts` | crear | 10 tests: `resolveWorkerUrl` (4 ramas) + `dispatchRun` (not_queued/no_worker_url/ok 202/ok sin secreto/409/dispatch_error). Mock factory obligatorio (N4), `fetch` mockeado, `console.error` silenciado |
| 6 | `pnpm-lock.yaml` | generar (M1) | `pnpm install` tras editar `package.json` |
| 7 | `tests/unit/validations/torneo.test.ts` | editar (−1) | **Desviación justificada**: se elimina el docblock `@jest-environment node` (redundante: el env `node` ya viene de `jest.config.js`). El docblock fuerza un `TestEnvironment` sin el mixin de Stryker ⇒ `Missing coverage results for: tests/unit/validations/torneo.test.ts` y el dry run abortaba. Sin él, el archivo corre igual |

### Desviaciones respecto del diseño (2, ambas por realidad del toolchain)

1. **`plugins` explícito en `stryker.conf.mjs`.** Con pnpm (sin hoisting) el glob default `plugins: ["@stryker-mutator/*"]` se resuelve contra el virtual store de `core` y no ve `jest-runner`/`typescript-checker` ⇒ `Could not inject [class CheckerWorker]` + `Unknown stryker config option "jest"`. Fix: `plugins: ["@stryker-mutator/jest-runner", "@stryker-mutator/typescript-checker"]` (bare import resuelve por el walk-up de Node hasta `node_modules` raíz).
2. **CLI**: en Stryker 10 la verificación de scope es `--dryRunOnly` (el `--dryRun` del design no existe; documentarlo para el orquestador en chunk 2/§9).

### Verificación del gate (ejecutada)

| Check | Resultado |
|---|---|
| `npx jest -c jest.config.mutation.js --listTests` | **10 suites exactas**: 7 `motor-torneo` (bracket, calendar, diagnostics, loader, model, solver-parity, verify) + `torneos/limits` + `torneos/dispatch` + `validations/torneo` |
| `npx stryker run --dryRunOnly` | **OK**: 14 archivos del scope, 1863 mutantes instrumentados, dry run con **119 tests**, **0 CompileError** |
| Sandbox | **21 MB** tras el dry run (límite B1 < 100 MB). `cleanTempDir: "always"` deja **0 residuo** |
| Smoke de checker + mutantes | `--mutate lib/torneos/limits.ts`: score 100 %, **0 `CompileError`**, sin `.stryker-tmp*` residual |
| `npx jest tests/unit/torneos/dispatch.test.ts` | **10/10 verdes** (cobertura 100 % de `dispatch.ts`) |
| `npx tsc --noEmit` | 0 errores |
| `pnpm run lint` | **0 errores** (285 warnings preexistentes en el repo; 0 en archivos nuevos) |

### Pendiente para el orquestador (chunk 2)

- `npx stryker --version` = `10.1.1` y baseline ×2 (`pnpm test:mutation`) → `mutation-baseline.md`.
- Al reemplazar `thresholds` (AC-05) y, si aplica D8, añadir `// EXCLUDED:` a nivel archivo.
- Los umbrales actuales (`{100,0,0}`) son placeholder: no bloquearán la primera corrida.

---

## 3a — Triaje de sobrevivientes: `lib/motor-torneo/model.ts` + `lib/motor-torneo/diagnostics.ts`

> Sub-triaje 3a de `change-map.md` §3 (fila 3a) según el proceso de `technical-design.md` §10.
> **AC-08 respetado: 0 líneas modificadas en `lib/**`.** Solo se editaron 2 archivos de test.

**Alcance de entrada (baseline):** `model.ts` 33 Survived + 5 NoCoverage · `diagnostics.ts` 122 Survived + 22 NoCoverage = **182 filas**.

**Archivos de test modificados (2):**

| Archivo | Cambio |
|---|---|
| `tests/unit/motor-torneo/model.test.ts` | +6 tests: orden determinista por `id` (P-3) con instancia cuyo orden de inserción no es el ordenado, costo `W_EXTENSION` en bloque de extensión, `W_TEMPRANO * b` en finales, `choque` de R3b (nombres/`ub`/integralidad/costo/coeficientes y caso de 1 sola final blanda), pareja desconocida en `bloqueados`, feeder sin variables en R5, `toCSC` (starts/indices/values) |
| `tests/unit/motor-torneo/diagnostics.test.ts` | +13 tests con fixtures manuales: bordes de `colorFor` (ρ=0.85 exacto, ρ=1, fase 0 casillas/0 partidos), agregación de `occupancyByTramo` (2 bloques mismo tramo), choques de doble categoría (1/2 choques, duras excluidas, potenciales sin bloque), `maxBloquesSeguidos` (racha 3, final potencial no cuenta, corte por día, orden de bloques, no consecutivos, reinicio tras corte, potenciales sin bloque), indicadores de grupo (span ≤2, span >2, cambio de día, `tam 4`, sin cancha, 2 canchas, parcialmente agendado, grupo desconocido, span sin bloque 0), días por pareja (3 días ≠ 2 días), y cuadro final (finales ordenadas por bloque con 2 y 3 categorías, primer partido por categoría, empate, sin bloque) |

**Método:** corrida 1 completa (score 89.30) → clasificación de las 40 filas restantes → asserts nuevos → corrida 2 de confirmación (`--mutate` acotado a los 2 archivos) + corrida 3 acotada por rango de línea para los mutantes de `byId`.

### Tabla de triaje — 31 filas restantes (todas con decisión)

| Archivo:línea | Mutador | Status | Decisión | Justificación (1 línea) |
|---|---|---|---|---|
| `model.ts:145:19` | EqualityOperator `j <= numCols` | Survived | **equivalent** | La iteración extra escribe `counts[numCols+1]` fuera del `Int32Array`: la escritura se descarta y `starts`/`cursor` quedan idénticos. |
| `model.ts:152:19` | EqualityOperator `k <= cols.length` | Survived | **equivalent** | Con `k === length`, `model.cols[k]` es `undefined` ⇒ `cursor[NaN]++` e `indices[NaN] = …` son no-ops en TypedArray. |
| `model.ts:163:3` | EqualityOperator `a.id <= b.id` | Survived | **equivalent** | `<` → `<=` sólo difiere en `a.id === b.id`; los ids son claves únicas de un `Record` ⇒ rama muerta. |
| `model.ts:163:22` | ConditionalExpression `true` | Survived | **equivalent** | El ternario interno sólo se evalúa con `a.id >= b.id`; con `true` devuelve `1` para `a>b` (igual que el original) y sólo cambiaría en empate (imposible). |
| `model.ts:163:22` | ConditionalExpression `false` | Survived | **equivalent** | Devuelve `0` cuando `a>b`; un comparador que nunca es positivo ordena ascendente de forma estable ⇒ mismo orden. |
| `model.ts:163:22` | EqualityOperator `a.id >= b.id` | Survived | **equivalent** | `>` → `>=` sólo cambia en empate, imposible con ids únicos. |
| `model.ts:163:22` | EqualityOperator `a.id <= b.id` | Survived | **equivalent** | `>` → `<=`: para `a>b` devuelve `0` y para `a<b` el ternario externo ya devolvió `-1` ⇒ comparador equivalente. |
| `model.ts:195:9` | ConditionalExpression `true` | Survived | **equivalent** | Fuerza `if (phase === "previa")`; en finales `m.parejas` es `null` ⇒ el `for` no itera. |
| `model.ts:196:43` | ArrayDeclaration `["Stryker was here"]` | NoCoverage | **equivalent** | `m.parejas ?? [...]` sólo se evalúa con `parejas === null`, imposible en previa (`deriveStructure` siempre las rellena). |
| `model.ts:197:68` | ArrayDeclaration `["Stryker was here"]` | Survived | **equivalent** | El id fantasma sólo se compara contra índices de bloque en `prohibidos.has(b)`; nunca coincide. |
| `model.ts:255:41` | ArrayDeclaration `["Stryker was here"]` | NoCoverage | **equivalent** | Igual que 196: en el bucle R3 la previa siempre trae `parejas`. |
| `model.ts:257:53` | ArrayDeclaration `["Stryker was here"]` | Survived | **equivalent** | Añade un matchId fantasma a `partidosPareja`; `varsDe.get(...)` devuelve `undefined` ⇒ 0 filas. |
| `model.ts:318:27` | OptionalChaining | Survived | **equivalent** | `?.` sólo protege alimentadores inexistentes; `m.alimentadores` sale de `buildBracket` con ids reales. |
| `model.ts:318:71` | ArrayDeclaration | NoCoverage | **equivalent** | `?? []` del mismo `alimentador` es inalcanzable (el id siempre existe). |
| `model.ts:324:62` | ArrayDeclaration | NoCoverage | **equivalent** | `partidosDeGrupo.get(grupo) ?? []`: todo grupo de `gruposOrigen` tiene partidos de previa. |
| `model.ts:327:16` | MethodExpression (sin `.sort`) | Survived | **equivalent** | `varsDe` se llena en orden ascendente de bloque ⇒ `.sort` es no-op. |
| `model.ts:327:69` | ArithmeticOperator `a[0] + b[0]` | Survived | **equivalent** | Sólo altera el orden de iteración de `vm`; el conjunto de filas R5 y sus coeficientes no cambia (nConstraints/familias intactos). |
| `model.ts:329:18` | MethodExpression (sin `.sort`) | Survived | **equivalent** | Idem 327: `vf` ya viene en orden ascendente de bloque. |
| `model.ts:329:73` | ArithmeticOperator `a[0] + b[0]` | Survived | **equivalent** | Idem 327: `vf` sólo alimenta `maxF` (`Math.max` sobre el mismo conjunto) y los coeficientes por columna. |
| `diagnostics.ts:103:7` | ConditionalExpression `false` | Survived | **equivalent** | El `if (capacity === 0)` es redundante: `phaseSemaforo` ya entrega `occupancy` ∞ (matches>0) o 0, y ambas ramas dan el mismo color. |
| `diagnostics.ts:151:76` | StringLiteral `""` | Survived | **equivalent** | Quita el sufijo `ext`/`base` de la clave de tramo, pero `dayLabel|phase` ya distingue los tramos ⇒ sin colisiones. |
| `diagnostics.ts:168:76` | StringLiteral `""` | Survived | **equivalent** | Misma clave que 151; al aplicarse el cambio también en la lectura, `tramos.get(key)` sigue encontrando el tramo. |
| `diagnostics.ts:199:11` | ConditionalExpression `true` | Survived | **equivalent** | `count` sale de un `Map` incrementado ⇒ nunca es 0; con `count === 1` el mutante suma `0` (igual que `count > 1`). |
| `diagnostics.ts:199:11` | EqualityOperator `count >= 1` | Survived | **equivalent** | Mismo razonamiento: sólo difiere en `count === 1`, donde `count - 1 === 0`. |
| `diagnostics.ts:214:39` | ArrayDeclaration | Survived | **equivalent** | `partido.parejas ?? [...]`: el id fantasma no existe en `inst.parejas` ⇒ `teams` vacío y sin violación. |
| `diagnostics.ts:215:7` | OptionalChaining | Survived | **equivalent** | `?.` sólo protege parejas inexistentes; `partido.parejas` sale de `deriveStructure` con ids reales. |
| `diagnostics.ts:261:69` | StringLiteral `"Stryker was here!"` | NoCoverage | **equivalent** | `blockAt(...)?.dayLabel ?? ""`: `blocksByGroup` sólo guarda idx con bloque válido ⇒ rama inalcanzable. |
| `diagnostics.ts:291:45` | ArrayDeclaration | Survived | **equivalent** | Igual que 214 en `pairDayIndicators`: sólo se evalúa con `parejas === null` (instancia inválida). |
| `diagnostics.ts:321:11` | OptionalChaining | Survived | **equivalent** | `inst.partidos[matchId]` siempre existe: los ids salen de `partidosPotenciales`. |
| `diagnostics.ts:322:11` | ConditionalExpression `true` | Survived | **equivalent** | Sin el filtro entran `undefined` en `blocks`, y `Array#sort` mueve los `undefined` al final sin llamar al comparador ⇒ `best` no cambia. |
| `diagnostics.ts:329:21` | EqualityOperator `i <= blocks.length` | Survived | **equivalent** | Iteración extra con `blocks[i] === undefined`: el `else` deja `run = 1` y `Math.max(best, 1)` no altera `best`. |

### Mutantes detectados — resumen

| Concepto | Valor |
|---|---|
| Filas del baseline (Survived + NoCoverage) | **182** (model 38 · diagnostics 144) |
| Filas que pasaron a **killed** | **147** |
| Filas que pasaron a **timeout** (detectado: bucle infinito) | **4** (`model.ts:145:32 j--`, `model.ts:152:42 k--`, `diagnostics.ts:329:21 i >= blocks.length`, `diagnostics.ts:329:40 i -= 1`) |
| Filas restantes | **31** (26 Survived + 5 NoCoverage) — **todas equivalentes probadas** |
| Filas sin decisión | **0** |

**Asserts con los que se mataron (por bloque):**

| Bloque | Test | Asserts añadidos |
|---|---|---|
| Orden determinista P-3 (`byId` + `sort`) | `model.test.ts` | `colNames.slice(0,6)` sobre instancia insertada en M,Z,A (ni ordenada ni invertida): mata `a.id >= b.id`, `-1 → +1`, condición forzada y la eliminación de `.sort(byId)` |
| Costos por bloque | `model.test.ts` | `costOf(x[…,2]) === W_EXTENSION` (bloque de extensión) y `costOf(x[final,b]) === W_TEMPRANO * b`, previa en 0 ⇒ mata `+= → -=`, `* → /`, `W_EXTENSION` omitido y ambos forzados del `if (phase === "final")` |
| R3b `choque` | `model.test.ts` | nombres exactos `choque[P1,4..5]`, `ub`, `integrality === 0`, costo `W_DOBLE_BLANDO`, coeficiente `-1` + 3 coeficientes `+1` de la fila, y `singleBlandoInstance` sin choque ⇒ mata `<= 1`/`continue`, nombre y objeto del `addVar`, `integer: false` |
| Defensivos del builder | `model.test.ts` | pareja `GHOST` no lanza (mata el `?.` de `inst.parejas[...].bloqueados`) y feeder sin variables no rompe R5 (mata el `continue` de `vf.length === 0`) |
| Semáforo / `colorFor` | `diagnostics.test.ts` | ρ = 0.85 exacto ⇒ verde (mata `>= AMBER`), ρ = 1 ⇒ amarillo, fase 0 casillas + 0 partidos ⇒ verde/0 y fase con casillas + 0 partidos ⇒ 0 (matan los ternarios de `colorFor` y `phaseSemaforo`) |
| `occupancyByTramo` | `diagnostics.test.ts` | tramo Jue con 2 bloques ⇒ `capacity: 4`, `matches: 2`; 3 tramos distintos ⇒ mata `+= → -=`, cuerpo del `for`, `else` y la clave colapsada |
| Choques de doble categoría | `diagnostics.test.ts` | 2 y 3 blandas en un bloque ⇒ 1 y 2 choques; `8vos` (dura) no cuenta; potenciales sin bloque ⇒ 0 ⇒ mata el `filter` de `blandos`, el `!`, el `continue`, `count - 1 → +1`, `+= → -=` y los forzados |
| `maxBloquesSeguidos` | `diagnostics.test.ts` | racha 3, final potencial no alarga, corte por día con idx contiguos, ordenación previa, no consecutivos mismo día ⇒ 1, reinicio tras corte (0,1,3,4 ⇒ 2) y potenciales sin bloque ⇒ 2 |
| Indicadores de grupo | `diagnostics.test.ts` | span ≤ 2 / > 2 / sin bloque 0, cambio de día, `tam 4` ⇒ span ≤ 1, sin cancha ⇒ 0, 2 canchas ⇒ 0, parcialmente agendado y grupo desconocido ⇒ `tam 3` |
| Días por pareja | `diagnostics.test.ts` | 2 parejas en 3 días + 1 en 2 días + 2 en 1 día ⇒ `{count:2,total:5}` y `dosDias: 1` |
| Finales y primer partido de cuadro | `diagnostics.test.ts` | finales ordenadas por bloque (2 y 4 categorías), primer partido por categoría (bloque más temprano), empate determinista y candidato sin bloque |
| Resto de `computeDiagnosis` | `diagnostics.test.ts` | `scheduledMatches` con agenda parcial, `extensionMatches`, horario laboral (Jue 14:00 / Vie 18:00 sí · Jue 19:00 no, borde del corte) y partido sin bloque no lanza |

### Scores

| Corrida | Alcance | Mutantes | Score | Detalle |
|---|---|---|---|---|
| Baseline | 14 archivos | — | **54.93 %** | 434 Survived + 105 NoCoverage (global) |
| 1 | `model.ts` + `diagnostics.ts` | 562 (183 CompileError preexistentes) | **89.30 %** | 330 killed · 4 timeout · 35 survived · 5 no cov |
| 2 (confirmación) | idem | 562 | **90.37 %** | 334 killed · 4 timeout · 31 survived · 5 no cov |
| 3 (acotada por rango) | `model.ts:163`, `diagnostics.ts:302/322/334/363` | 20 | — | 13 killed · 6 survived (los 5 equivalentes de `byId` + `322:11`) · 1 CompileError |

**Estado final del scope (corrida 2 + kills verificados en corrida 3):**

| Archivo | killed | timeout | survived | no cov | Score |
|---|---|---|---|---|---|
| `diagnostics.ts` | 173 | 2 | 11 | 1 | **93.58 %** |
| `model.ts` | 166 | 2 | 15 | 4 | **89.84 %** |
| **Total scope** | **339** | **4** | **26** | **5** | **91.71 %** (343/374) |

> `CompileError` (183) = mutantes que el `typescript-checker` rechaza: preexistentes, no puntúan. `Ignored` = `ignoreStatic: true`.

### Verificación final

| Check | Resultado |
|---|---|
| `npx jest tests/unit/motor-torneo/{model,diagnostics}.test.ts` | **62/62 verdes** |
| `pnpm test:unit` (repo completo) | **83 suites · 1146 passed / 1 skipped · 0 fallos** |
| `npx tsc --noEmit` | **0 errores** |
| `pnpm run lint` | **0 errores** (286 warnings preexistentes) |
| `lib/**` | **sin cambios** (AC-08) · `stryker.conf.mjs` sin cambios |

> ⚠️ Para el orquestador: `reports/mutation/mutation.json` contiene ahora la **corrida 3 acotada** (20 mutantes); la evidencia del scope completo está en `mutation-run2.log` de esta carpeta. Regenerar con `pnpm test:mutation` al cierre de fase si se necesita el JSON completo.


---

## 3b — Triaje de sobrevivientes: `lib/motor-torneo/bracket.ts` + `lib/motor-torneo/calendar.ts`

> Sub-triaje 3b de `change-map.md` §3 (fila 3b) según `technical-design.md` §10.
> **AC-08 respetado: 0 líneas modificadas en `lib/**` y 0 en `stryker.conf.mjs`.** Solo 2 archivos de test.

**Alcance de entrada (baseline `mutation-run2.json`):** `bracket.ts` 9 Survived + 14 NoCoverage · `calendar.ts` 21 Survived = **44 filas**.

**Dato del reporte que cambia el triaje:** `calendar.ts:17-26` (16 filas) tienen `static: true` y **`testsCompleted: 0`** ⇒ no fueron ejecutadas: las descarta `ignoreStatic: true` de `stryker.conf.mjs`. Ningún test puede matarlas sin tocar la config (prohibido por AC-08); se documentan como equivalentes-por-config y se deja el golden `toEqual(CALENDARIO)` para cuando se retire la opción.

**Archivos de test modificados (2):**

| Archivo | Cambio |
|---|---|
| `tests/unit/motor-torneo/bracket.test.ts` | +1 describe (2 tests): `deriveStructure` con grupo inexistente (`GHOST`) ⇒ throw; pairing exacto de 1ª ronda sin byes para `g = 2, 4, 8` (`sourceGroups` por cruce). Total 15 → 17 tests. |
| `tests/unit/motor-torneo/calendar.test.ts` | +1 describe (2 tests) golden de `CALENDARIO` + bordes `00:00`/`23:59`; asserts nuevos dentro de 3 tests existentes: mensaje exacto de solape, contiguo exacto y `previo.start === end` no lanzan, `blocks: 0` válido, `courts: 0` válido. Total 18 → 20 tests. |

### Tabla de triaje — 44 filas (todas con decisión)

| Archivo:línea | Mutador | Status | Decisión | Justificación (1 línea) |
|---|---|---|---|---|
| `bracket.ts:103:21` | EqualityOperator `i <= g` | Survived | **equivalent** | La iteración extra sólo agrega `E[2g..2g+1]` a `posiciones`, que nunca se lee (los nodos usan `posiciones[0..S-1]`). |
| `bracket.ts:104:32` | ArithmeticOperator `i - Math.floor(g/2)` | Survived | **equivalent** | `E[g+k]` y `E[k]` difieren sólo en el *rango* (1º vs 2º), y el rango no es observable: `sourceGroups`, `feeders`, `code` y `byes` son idénticos para `g = 2..16` (verificado con el test de pairing exacto). |
| `bracket.ts:110:21` | ConditionalExpression `false` | Survived | **equivalent** | Cuerpo del swap inalcanzable: `resto` es un sufijo de `E` (bloque de 1º y luego de 2º, cada uno con grupos distintos) y `byes` siempre es par ⇒ dos entradas adyacentes nunca comparten grupo (`g = 1` sería el único caso y ahí `byes = 0`). |
| `bracket.ts:110:21` | EqualityOperator `k <= resto.length - 1` | Survived | **equivalent** | Misma rama muerta: el `continue` implícito del `for` no cambia el cuerpo no ejecutado. |
| `bracket.ts:110:21` | EqualityOperator `k >= resto.length - 1` | Survived | **equivalent** | Idem: condición del lazo de una rama cuyo cuerpo nunca corre. |
| `bracket.ts:110:51` | BlockStatement `{}` | Survived | **equivalent** | Vaciar el cuerpo del `for` del swap no altera nada: el swap nunca se ejecuta. |
| `bracket.ts:111:11` | ConditionalExpression `false` | Survived | **equivalent** | `resto[k].group === resto[k+1].group` es siempre `false` (ver 110) ⇒ el `if` es código defensivo del original. |
| `bracket.ts:111:52` | BlockStatement `{}` | NoCoverage | **equivalent** | Cuerpo del swap: inalcanzable por el mismo argumento de adyacencia (0 ejecuciones en toda la suite). |
| `bracket.ts:111:52` | ConditionalExpression `true` | NoCoverage | **equivalent** | Idem: la guarda `k + 2 < resto.length` vive dentro de la rama muerta. |
| `bracket.ts:111:52` | EqualityOperator `k + 2 <= resto.length` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:111:52` | EqualityOperator `k + 2 >= resto.length` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:111:52` | ArithmeticOperator `k - 2` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:112:31` | ArithmeticOperator `k - 1` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:113:15` | ArithmeticOperator `k - 1` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:113:30` | ArithmeticOperator `k - 2` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:114:15` | ArithmeticOperator `k - 2` | NoCoverage | **equivalent** | Rama muerta. |
| `bracket.ts:156:11` | ConditionalExpression `false` | Survived | **equivalent** | `reales.length === 0` inalcanzable: en el nivel 0 los pases libres son `(E[i], null)` (1 lado real) y en niveles superiores cada hijo aporta ≥1 lado real (`partido` o `resuelto` propaga un entrante no nulo). |
| `bracket.ts:156:32` | BlockStatement `{}` | NoCoverage | **equivalent** | Idem: el `throw` defensivo nunca se ejecuta. |
| `bracket.ts:157:25` | StringLiteral `""` | NoCoverage | **equivalent** | Idem: mensaje de un `throw` inalcanzable. |
| `bracket.ts:169:55` | ArrayDeclaration `["Stryker was here"]` | NoCoverage | **equivalent** | `gruposOrigen` se asigna junto con `partido` (líneas 174-175) y sólo se recorre un nodo que cumple `lado.nodo.partido` ⇒ `?? []` nunca se activa. |
| `bracket.ts:215:11` | ConditionalExpression `false` | Survived | **killed** | Nuevo test: `deriveStructure({ "1ra": { grupos: ["GHOST"] } }, {})` ⇒ sin la guarda revienta con `TypeError` en `grupo.parejas` y no con «Grupo GHOST no existe en la instancia». |
| `bracket.ts:215:19` | BlockStatement `{}` | NoCoverage | **killed** | Mismo test: exige el `throw` con el mensaje exacto. |
| `bracket.ts:216:25` | StringLiteral `""` | NoCoverage | **killed** | Mismo test: `toThrow("Grupo GHOST no existe en la instancia")` falla si el mensaje queda vacío. |
| `calendar.ts:17:55` | ArrayDeclaration `[]` | Survived | **equivalent (config)** | Estático con `testsCompleted: 0` ⇒ `ignoreStatic: true` lo salta: ningún test lo ejecuta. Se agregó `toEqual(CALENDARIO)` (6 tramos) para matarlo si se retira la opción. |
| `calendar.ts:18:15` | StringLiteral `""` (`Jue`) | Survived | **equivalent (config)** | Estático saltado por `ignoreStatic`; cubierto por el golden de `CALENDARIO`. |
| `calendar.ts:18:83` | BooleanLiteral `true` (`isExtension`) | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:19:15` | StringLiteral `""` (`Vie`) | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:19:83` | BooleanLiteral `true` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:20:15` | StringLiteral `""` (`Sab`) | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:20:83` | BooleanLiteral `true` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:21:15` | StringLiteral `""` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:21:82` | BooleanLiteral `true` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:22:15` | StringLiteral `""` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:22:82` | BooleanLiteral `true` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:23:15` | StringLiteral `""` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:23:82` | BooleanLiteral `false` (`isExtension: true`) | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:26:14` | Regex `/([01]\d\|2[0-3]):([0-5]\d)$/` | Survived | **equivalent (config)** | Estático saltado por `ignoreStatic`; los tests de `parseHHmm` (`24:00`, `7:30`, `08:60`, `ocho`) ya lo matarían si se ejecutara. |
| `calendar.ts:26:14` | Regex `/^([01]\d\|2[0-3]):([0-5]\d)/` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:26:14` | Regex `/^([01]\d\|2[^0-3]):([0-5]\d)$/` | Survived | **equivalent (config)** | Idem. |
| `calendar.ts:55:44` | EqualityOperator `tramo.blocks <= 0` | Survived | **killed** | Assert nuevo en «rechaza bloques negativos o no enteros»: `blocks: 0` es un tramo vacío válido ⇒ `not.toThrow()`. |
| `calendar.ts:65:33` | ConditionalExpression `true` | Survived | **killed** | Assert nuevo en «detecta solape en el mismo día»: tramos contiguos `Sab 08:00(2) + Sab 10:30(2)` no lanzan (con `true` lanzaría). |
| `calendar.ts:65:33` | EqualityOperator `previo.start <= end` | Survived | **killed** | Assert nuevo: tramo previo que arranca justo al cerrar el actual (`Dom 15:30(2)` y luego `Dom 14:15(1)`) no es solape. |
| `calendar.ts:68:13` | StringLiteral `""` | Survived | **killed** | Assert nuevo: `toThrow("Solape en Dom: 18:00 (2 bloques) se cruza con el tramo de 08:00")` falla con mensaje vacío. |
| `calendar.ts:90:36` | EqualityOperator `courts <= 0` | Survived | **killed** | Assert nuevo en «rechaza un número de canchas inválido»: `buildBlocks(CALENDARIO, 0)` ⇒ 38 bloques con `capacity: 0`. |

> **Por qué sobrevivían `65:33` y `68:13`:** con `coverageAnalysis: "perTest"` el reporte sólo atribuyó 3 tests de cobertura a esa línea (ids 6/62/65) —los que sólo asertaban el camino que lanza—, así que las aserciones `not.toThrow()` que ya existían en otros tests de `calendar.test.ts` nunca se ejecutaron contra el mutante. Los asserts se movieron **dentro** de los tests sí atribuidos.

### Conteos finales

| Archivo | Filas | killed | equivalent | equivalent (config) |
|---|---|---|---|---|
| `bracket.ts` | 23 | **3** | 20 | — |
| `calendar.ts` | 21 | **5** | 0 | 16 |
| **Total** | **44** | **8** | **36** | (16 de ellas) |

**Score teórico del scope 3b:** 8 de 44 muertes nuevas sobre filas que el baseline dejaba vivas; de las 28 filas realmente ejecutables, 8 quedan killed y 20 son equivalentes demostrados (0 sin decisión).

### Verificación (solo mis tests, sin Stryker)

| Check | Resultado |
|---|---|
| `npx jest tests/unit/motor-torneo/bracket.test.ts tests/unit/motor-torneo/calendar.test.ts` | **37/37 verdes** (2 suites) |
| `npx tsc --noEmit` | **0 errores** |
| `pnpm run lint` | **0 errores** (286 warnings preexistentes) |
| `lib/**` / `stryker.conf.mjs` | **sin cambios** (AC-08) |
| Cobertura del tramo | `bracket.ts` sin cubrir sólo `112-114` y `157` (código defensivo muerto); `calendar.ts` 100 % statements |

> ⚠️ Para el orquestador: la confirmación real de los 8 kills sale de la **corrida combinada 3a+3b**; no se ejecutó Stryker en esta sub-tarea (riesgo de corromper el plan). `mutation.json` actual sigue siendo de otra corrida: la evidencia de entrada es `reports/mutation/mutation-run2.json`.

---

## 3c — Triaje de sobrevivientes: `lib/motor-torneo/loader.ts` + `lib/motor-torneo/verify.ts`

> Sub-triaje 3c de `change-map.md` §3 (fila 3c) según `technical-design.md` §10.
> **AC-08 respetado: 0 líneas modificadas en `lib/**` y 0 en `stryker.conf.mjs`.** Solo 2 archivos de test (`loader.test.ts`, `verify.test.ts`).

**Alcance de entrada (baseline `reports/mutation/mutation-run2.json`):** `loader.ts` 108 Survived + 9 NoCoverage · `verify.ts` 46 Survived + 13 NoCoverage = **176 filas** (117 + 59).

### Tabla de triaje — `loader.ts` (117 filas, todas con decisión)

| Grupo (líneas) | Patrón | Filas | Base | Decisión | Justificación / test |
|---|---|---|---|---|---|
| `125`, `128` | Regex `dateSchema`/`hourSchema` (15) + mensaje (2) | 17 | Survived | **killed** | Nuevo «formato distinto de YYYY-MM-DD / HH:mm»: `x2026-11-05`, `2026-11-05x`, `abcd-11-05`, `88:00`, `08:60`, `24:00` + `message` exacto («formato esperado …»). |
| `132` | `dia` min/max + mensajes | 5 | Survived | **killed** | `dia: ""` ⇒ «dia es requerido»; `"Sabad"` ⇒ «dia admite hasta 3 caracteres». |
| `134` | `bloques` min/max/int + mensaje | 3 | Survived | **killed** | `0`, `25` inválidos; `1.5` ⇒ «bloques debe ser un entero». |
| `140` | `name` min/max + mensaje | 4 | Survived | **killed** | `""` ⇒ «name es requerido»; `"x".repeat(201)` inválido. |
| `143` | `courts` min/max/int + mensaje | 3 | Survived | **killed** | `0`, `25`; `1.5` ⇒ «courts debe ser un entero». |
| `144` | `blockMinutes` min(30)/max(120) | 2 | Survived | **killed** | `29`, `121`, `1.5` rechazados por schema (el 30 llega a la guarda M1). |
| `148` | `personas` tuple `[]` | 1 | Survived | **killed** | Tuple de 1 y de 3 personas rechazado. |
| `149-150` | `persona` min/max + mensaje | 8 | Survived | **killed** | `""` ⇒ «persona requerida»; 51 chars inválido. |
| `152` | `no_disponible` `.min(0)` | 1 | Survived | **killed** | `-1` rechazado. |
| `156` | enum `["H","M"]` | 2 | Survived | **killed** | Test que acepta `H` y `M` a la vez y rechaza `"X"`. |
| `157` | `nivel` min(1)/max(10) | 2 | Survived | **killed** | `0` y `11` rechazados. |
| `159-160` | claves/valores de `grupos` (8/20) | 6 | Survived | **killed** | Clave de 9 chars y valor de 21 chars ⇒ `ok:false`. |
| `167` | `calendario.min(1)` + mensaje | 2 | Survived | **killed** | `calendario: []` ⇒ «calendario requiere al menos 1 tramo». |
| `169` | `capacidad_especial` (regex clave, min/max valor, mensaje) | 7 | Survived | **killed** | Clave `abc`, valor `25`, `-1`, `1.5` rechazados. |
| `171-172` | claves de `categorias` (10) y `parejas` (20) | 6 | Survived | **killed** | Clave de 11 / 21 chars ⇒ `ok:false`. |
| `192` | `join(".")` del path | 1 | Survived | **killed** | Se aserta `path` exacto anidado: `meta.name`, `calendario.0.inicio`. |
| `207` | mensaje `blockMinutes` M1 | 1 | Survived | **killed** | `toEqual` del error completo («… solo soporta bloques de 75 min (recibido 30)»). |
| `221-223` | loop de `capacidad_especial` (NoCoverage) | 1 | NoCoverage | **killed** | Nuevo test: `{"7": 1}` ⇒ `blocks[7].capacity === 1` y `blocks[6].capacity === 8`. |
| `247-248` | `catCode.length > 10` | 5 | Sur/NoCov | **equivalent 2 / killed 1** | `cond→false` es **equivalent** (el schema acota `max(10)` ⇒ inalcanzable). El `>= 10` **sí** se mata (3g): categoría de 10 chars ⇒ el error es del grupo derivado, no de la categoría (`paths` no contienen `categorias[ABCDEFGHIJ]`). |
| `257-258` | `groupCode.length > 10` | 4 | Sur/NoCov | **killed** | `groupKey` de 8 chars («1ra-G1234567» = 12) ⇒ error con `path` y mensaje exactos. **3g**: el `>= 10` sobrevive al caso de 12 chars; se mata con un grupo de **exactamente 10** («1ra-G12345») aceptado (`ok:true`). |
| `267, 275, 280, 285` | mensajes R5/R1 (incl. `[...seen].join(", ")` e `ids.length`) | 6 | Survived | **killed** | `toContainEqual` de `{code, path, message}` exactos, incluido «… en las categorías 1ra y 2da.». **3g**: el separador `", "` sólo se observa con 3 categorías ⇒ nuevo test «1ra, 2da y 3ra». |
| `290`, `292` | `!teamCategory.has` / `teamGroup.set` | 2 | Survived | **equivalent** | Sólo se desvían cuando la pareja está en 2 categorías, caso que siempre emite `team_in_two_categories` y hace `return` antes de exponer el estado final. |
| `301` | `personas ?? []` en `groupOutputs` | 2 | Survived | **equivalent** | Pareja ausente ⇒ `orphan_team` ⇒ `return` antes de devolver `categories`. |
| `302` | `unavailable` (Set, sort, `??`, `a-b`) | 5 | Survived | **killed 4 / equivalent 1** | `no_disponible: [2,0,2]` ⇒ `[0,2]` (dedupe+orden+`??`). El `a-b→a+b` es **equivalent**: para enteros ≥ 0 el signo del comparador coincide salvo `(0,0)`. |
| `329`, `338`, `351`, `361` | mensajes R1/R2/R4/R3 | 4 | Survived | **killed** | Cada regla aserta `{code, path, message}` exactos. |
| `368-370` | fallbacks `categoria/grupo/personas` de `Pareja` | 3 | Survived | **equivalent** | Campos write-only: `parejas` no forma parte de `TournamentInput` (sólo se lee `bloqueados` en R0). |
| `393` | `if (phase !== "previa") continue` | 1 | Survived | **killed** | Test «sin bloques de previa»: 3 errores (sólo previa) en vez de 4. |
| `394` | `partido.parejas ?? []` | 1 | NoCoverage | **equivalent** | Todo partido de previa nace con 2 parejas (`deriveStructure`). |
| `396-397` | `parejas[x]?.bloqueados ?? []` | 6 | Sur/NoCov | **killed 2 / equivalent 4** | `??`→`&&` **no** lo mataba el test R0 existente (A y B bloqueaban los mismos bloques ⇒ el otro lado seguía bloqueando todo): corregido en 3g con dos fixtures asimétricos (sólo A / sólo B bloquean los 3 bloques). `?.`→`.` y `["Stryker was here"]` son equivalentes: si la pareja falta, `ok:false` corta en `errors.length > 0` (L375) antes de R0. |
| `404` | mensaje R0 | 1 | Survived | **killed** | Mensaje exacto del partido sin bloque compatible. |
| `411-412` | R6 `>` + producto | 4 | Survived | **killed 4** | Nuevo fixture: 25 cat × 24 partidos = **600 partidos** × **200 bloques** = 120 000 casillas ⇒ `ok:true` (mata ambos `>=`); 601 ⇒ error. **3g**: el `cond→false` y el `*`→`/` no los mataba el caso 601 (`matches > 600` dispara primero): nuevo fixture **600 partidos × 298 bloques = 178 800 casillas** ⇒ error sólo por el producto. |
| `417` | mensaje `instance_too_large` | 1 | Survived | **killed** | «601 partidos × 200 bloques supera el límite (600 partidos, 120000 casillas).». |

### Tabla de triaje — `verify.ts` (59 filas, todas con decisión)

| Grupo (líneas) | Patrón | Filas | Base | Decisión | Justificación / test |
|---|---|---|---|---|---|
| `23` | `byId` (ternarios, `-1`→`+1`) | 9 | Sur/NoCov | **killed 4 / equivalent 2 (+3 corregidos en 3g)** | «missing ordena por id» sobre una instancia con `partidos` en orden inverso. **3g**: con sólo 2 `missing` el comparador constante seguía acertando; se añaden dos órdenes no monótonos (uno con los `missing` en orden descendente) ⇒ mueren `cond→true` (L23:3), `cond→true` (L23:22) y los `>=`/`<=` de L23:22. Siguen **equivalent**: `<=` de L23:3 (ids únicos ⇒ `==` inalcanzable) y `cond→false` de L23:22 (`a<b ? -1 : 0` es un comparador válido). |
| `48` | `.sort(byId)` | 1 | Survived | **killed** | Mismo test: sin sort el orden sería el de inserción inverso. |
| `59-60` | `{ matchId }` de `missing` | 2 | Survived | **killed** | `toEqual` del error completo (con `matchId`) para bloque y cancha ausentes. |
| `62` | early return de la regla 1 | 1 | Survived | **killed** | Mismo test: exactamente 2 errores (no capacity/precedence añadidos). |
| `71` | `[...porBloque.entries()].sort((a,b) => a[0]-b[0])` | 2 | Survived | **killed** | Test de capacidad con exceso en bloques 1 y 2 (mapa invertido) ⇒ mensajes en orden 1,2. `a[0]+b[0]` invierte el orden. |
| `76` | mensaje capacity | 1 | Survived | **killed** | «capacidad excedida en bloque 1: 2 > 1» exacto. |
| `82` | mensaje + `{blockIdx}` de `court_collision` | 2 | Survived | **killed** | `toEqual` con `message` y `blockIdx`. |
| `88-89` | rango de cancha + mensaje | 2 | Survived | **killed** | `cancha 0` ⇒ error con mensaje exacto; `cancha 2 = nCanchas` sin error (borde). |
| `96` | `Object.keys(inst.personas).sort()` | 1 | Survived | **killed** | Escenario doble-categoría con `personas` invertidas y aserción del listado completo ordenado (P0, P10, P2…). |
| `98` | `doble = parejas.length > 1` | 4 | Survived | **killed** | Dos tests: finales duras colisionando para una persona doble (mata `<=`) y persona de una sola pareja sin colisión (mata `>=` y los ternarios). |
| `101` | `if (!partido) return false` | 2 | Sur/NoCov | **equivalent** | `partidosPotenciales` devuelve ids de `Object.values(inst.partidos)` ⇒ `partido` siempre existe. |
| `103` | `doble && duras.has(ronda)` | 2 | Survived | **killed** | Mismo par de tests: `false` pierde el choque de finales; `\|\|` marca a la persona de una sola pareja. |
| `113` | `[...porBloquePersona].sort((a,b) => a[0]-b[0])` | 2 | Survived | **killed** | Aserción del orden bloque 0 → bloque 2 para P0 (mapa insertado 2,3,0,4). |
| `117-118` | mensaje + `{blockIdx}` de `person_overlap` | 3 | Survived | **killed** | `toEqual` de los 12 errores ordenados con mensaje y `blockIdx`. |
| `127` | `inst.parejas[x]?.bloqueados` | 1 | Survived | **killed** | `inst.parejas = {}` no lanza (con `.` sería `TypeError`). |
| `126` | `partido.parejas ?? []` | 1 | NoCoverage | **equivalent** | Todo partido de previa tiene `parejas` (ídem `394` del loader). |
| `130` | mensaje availability | 1 | Survived | **killed** | «disponibilidad violada: C1-G1-P1 en bloque 0 (A)» exacto. |
| `143`, `146`, `148` | `partidosDeGrupo`, `feeders`, loop `cubiertos` | 3 | Survived | **killed** | `143`: precedencia vía expansión de grupo (test existente). `146`/`148`: los fixtures previos nunca añadían feeders de grupo *dentro* del margen (final en b4 con grupos en b0/b1) ⇒ sobrevivían. **3g**: fixture manual (semi en b2 cubre `C1-G1`, final en b0, grupos en b0) ⇒ si `cubiertos` queda vacío aparecen 3 errores en vez de 2. |
| `149` | `inst.partidos[a]?.gruposOrigen ?? []` | 4 | Sur/NoCov | **killed 2 / equivalent 2** | Semis borradas ⇒ expande `partidosDeGrupo` (mata `?.`, `&&`). **3g**: el `add` eliminado (CallExpression) sobrevive al fixture anterior (cubiertos quedaba vacío igual); el fixture manual lo mata (3 errores). El `["Stryker was here"]` no altera el resultado (alimentador inexistente ⇒ sin grupos) ⇒ **equivalent**. |
| `152` | `!cubiertos.has(grupo)` + `?? []` | 2 | Sur/NoCov | **killed 1 / equivalent 1** | `cond→true` se mata con el fixture manual de 3g (duplica feeders de `C1-G1`: 3 errores). **3g corrige** el claim previo: con grupos en b0/b1 y final en b4 el push extra no generaba error. El `["Stryker was here"]` del `?? []` es **equivalent** (todo grupo de origen del cuadro existe como grupo de previa). |
| `156` | `bloqueFeeder === undefined` | 1 | Survived | **equivalent** | Sin `continue`, `bloque < undefined + sep` es `NaN` ⇒ comparación falsa ⇒ mismo resultado. |
| `160` | mensaje precedence | 1 | Survived | **killed** | «precedencia: C1-final-1 (b4) antes de C1-semi-1 (b3)» exacto. |
| `168` | frontera sabado | 1 | Survived | **killed** | Test existente de fase (final en bloque de previa) exige la rama `fronteraSabado`. |
| `172` | mensaje + `{matchId,blockIdx}` de fase | 2 | Survived | **killed** | `toEqual` del error de fase con frontera. |
| `178-179` | rama `else` (NoCoverage) | 2 | NoCoverage | **killed** | Nuevo test con `fronteraSabado:false` (previa en bloque final). |
| `181` | `bloque?.phase !== "previa"` | 4 | NoCoverage | **killed** | Mismo test: con `front` válida 0 errores de fase; con previa en bloque final 1 error. |
| `184-185` | mensaje + `{matchId,blockIdx}` de «previa fuera de bloques» | 2 | NoCoverage | **killed** | `toEqual` del error completo. |

### Conteos finales (analíticos; la confirmación sale de la corrida Stryker combinada)

| Archivo | Filas | killed | equivalent |
|---|---|---|---|
| `loader.ts` | 117 | **101** | 16 |
| `verify.ts` | 59 | **50** | 9 |
| **Total 3c** | **176** | **151** | **25** |

> Cifras = expectativa por diseño de asserts (3c + correcciones 3g). La confirmación definitiva sale de la corrida Stryker combinada.

**0 grupos sin decisión.** Los 28 equivalentes se apoyan en: (a) guardas de schema que hacen inalcanzable un check duplicado, (b) `return` temprano que oculta estado write-only, (c) comparadores con signo equivalente sobre el dominio, (d) ramas cuya única entrada ya es un error estructural.

### Verificación (solo mis tests, sin Stryker)

| Check | Resultado |
|---|---|
| `npx jest tests/unit/motor-torneo/loader.test.ts tests/unit/motor-torneo/verify.test.ts` | **72/72 verdes** (2 suites) |
| `npx tsc --noEmit` | **0 errores** |
| `pnpm run lint` | **0 errores** (288 warnings: 286 preexistentes + 2 `max-lines` nuevos, igual que `diagnostics.test.ts`) |
| `lib/**` / `stryker.conf.mjs` | **sin cambios** (AC-08) |
| Cobertura del tramo | `loader.ts` 99.15 % stmts (única línea sin cubrir: `248`, equivalent); `verify.ts` 100 % líneas / 97.93 % stmts |

> ⚠️ Para el orquestador: la confirmación de los 148 kills sale de la **corrida Stryker combinada final** (no ejecutada aquí por diseño). `reports/mutation/mutation-run2.json` sigue siendo el baseline de entrada.

---

## Sub-tarea 3d · `lib/motor-torneo/{solver,courts,engine}.ts`

Archivos de test tocados: `tests/unit/motor-torneo/solver-parity.test.ts` (ampliado) y `tests/unit/motor-torneo/courts.test.ts` (**nuevo**). Sin tocar `lib/**` ni `stryker.conf.mjs` (AC-08).

### `solver.ts` — 18 Sur + 36 NoCov = 54 filas

| Grupo (líneas) | Patrón | Filas | Clasificación | Test que lo ejerce |
|---|---|---|---|---|
| `27:9`, `30` | Clamp `value <= 0`, `!Number.isFinite`, `Math.min/Math.max` | 6 | **killed** | `clampTimeLimitMs` (undefined, NaN, +Inf, 0, −5, 1 000, 300 000, redondeo) |
| `34-35` | `toHiGHSBound` ±Infinity | 2 | **equivalent** | **3g corrige el claim de «killed»**: en runtime `highs.infinity === Infinity` ⇒ `toHiGHSBound` es la identidad y los mutantes `cond→false` devuelven el mismo valor que `return value` (verificado con `node -e` sobre el WASM). Los `cond→true` y el `!==` sí mueren (`solveMilp` infeasible/unbounded les cambia el bound). |
| `45` | `mapStatus` optimal | 1 | **killed** | infeasible/unbounded (no entra a la rama optimal) |
| `46` | `mapStatus` infeasible | 3 | **killed** | `solveMilp` infeasible |
| `47` | `mapStatus` unbounded (∧/∨) | 8 | 5 killed / 3 excluded (coste) | **3g corrige**: el `cond→true` sobrevive (la única línea 47 cubierta es el caso *unbounded*, donde `true` devuelve lo mismo) y los dos mutantes de `unboundedOrInfeasible` no tienen cobertura; distinguirlos exige forzar un status `unboundedOrInfeasible` ⇒ fuera del dominio barato, mismo criterio que `51-54`. |
| `144` | `hasSolution = solutionStatus === 2` | 1 | **killed** | infeasible (mutante `true` cae en `getSolution` y cambia status) |
| `149-158` | Bloque `!hasSolution` + `status==="infeasible"` | 7 | **killed** | infeasible (assignment `{}`, `mipGap=null`, mensaje «sin solución primal»). **3g**: el template del mensaje (L156) sobrevivía al no asertarse; ahora `expect(result.message).toContain("sin solución primal")`. El `cond→true` de L153 queda **equivalent** (sin incumbente HiGHS no emite `mip_gap` ⇒ ambas ramas null) y el `"mip_gap"` de L153:69 es **NoCoverage excluded (coste)** (rama no-infeasible sin solución inalcanzable sin forzar un límite). |
| `51-54` | Ramas `timeLimit/objectiveBound/objectiveTarget/solutionLimit` | 16 | **excluded (coste)** | Requiere forzar un status de límite ⇒ ≥30 s de re-solve WASM (clamp MIN) |
| `55-57` | `return hasSolution ? "feasible_time_limit" : "error"` (BlockStatement NoCov) | 1 | **excluded (coste)** | **3g**: línea fuera del rango `51-54`; es el cuerpo del `if` de límite ⇒ misma justificación que `51-54` |
| `105`, `129` | Fallo de carga WASM / de construcción | 2 | **excluded (coste)** | Exige mockear el módulo `highs` o un modelo que HiGHS rechace |
| `136` | `time_limit = ms/1000` | 1 | **excluded (coste)** | Sólo observable haciendo que el solve agote el presupuesto |
| `179` | Mensaje del `catch` de `run()` | 1 | **excluded** | Requiere que `solver.run()` lance |
| `98`, `163`, `167`, `175`, `182-184` | `elapsed`, umbral `>0.5`, mensajes, `finally/dispose` | 6 | **equivalent** | `x` binaria ⇒ nunca 0.5; ms/mensajes no son contrato (EC-10) |
| **Total** | | **54** | 28 killed · 21 excluded · 6 equivalent (reclasificado en 3g: 34-35 equivalent, 47 3 excluidas, 55-57 excluida) | |

> EC-10 respetado: los `solveMilp` corren sobre modelos MILP **mínimos construidos a mano**; se asevera estado/asignación, nunca `objective`/`gap` con valores fijos.

### `courts.ts` — 32 Sur + 2 NoCov = 34 filas

| Grupo (líneas) | Patrón | Filas | Clasificación | Test |
|---|---|---|---|---|
| `36` | `sort` de bloques y `a-b` | 2 | **killed** | bloque 1 insertado antes del 0 (la preferencia depende del orden) |
| `37` | `sort` de partidos + `?? []` | 1 killed / 1 equivalent | killed / equivalent | fallback determinista con ids desordenados; `?? []` inalcanzable (keys salen de `values`) |
| `45` | Rama `phase === "previa"` | 4 killed / 1 equivalent | killed / equivalent | repetición de cancha; `partido.phase` (sin `?.`) equivalente |
| `46` | Clave `${grupo}@${bloque-1}` | 1 killed / 1 equivalent | killed / equivalent | `bloque+1` rompe la repetición; colisión de clave no observable con ≤2 grupos |
| `47-48` | Heredar de alimentadores | 3 killed / 2 equivalent | killed / equivalent | final hereda cancha; `alimentadores && []` mata; `?.`/NoCov equivalentes |
| `50` | `heredada !== undefined && includes` | 2 killed / 4 equivalent | killed / equivalent | alimentador sin cancha (`zz`) ⇒ salta al siguiente; `includes` interno es redundante con el externo |
| `59` | `libres.splice` | 1 equivalent | equivalent | la colisión sólo aparecería con >nCanchas pendientes en el bloque |
| `71-76` | Registrar repetición + guard `cancha!==undefined` | 8 killed / 4 equivalent | killed / equivalent | previa sin cancha no pisa la cancha recordada; `partido.phase`/strings equivalentes |
| **Total** | | **34** | 18 killed · 16 equivalent | |

### `engine.ts` — 13 Sur + 1 NoCov = 14 filas

| Grupo (líneas) | Patrón | Filas | Clasificación | Test |
|---|---|---|---|---|
| `94` | `options.timeLimitMs ?? tiempoMax*1000` + `/1000` | 2 | **killed** | infeasible sin `options` ⇒ `meta.timeLimitMs === 120000` |
| `107` | `flagged = errores.length > 0` | 4 | **killed** | infeasible (`[]` ⇒ false) + agenda con `court_range` (⇒ true) |
| `121` | `ok = solved && !flagged` | 3 killed / 1 equivalent | killed / equivalent | infeasible (ok=false) + flagged (ok=false); `Cond=false` no observable |
| `124` | `verificationSkipped = !solved` | 1 | **killed** | ambos estados (true en infeasible, false en resuelto) |
| `91`, `100`, `130` | `buildMs/solveMs/totalMs` | 3 | **equivalent** | aritmética de ms: sólo signo/orden, no se asevera el valor |
| **Total** | | **14** | 10 killed · 4 equivalent | |

---

## Sub-tarea 3e · `lib/validations/torneos.ts`, `lib/torneos/{limits,dispatch}.ts`

### `lib/validations/torneos.ts` — 6/6 **Ignored** (`ignoreStatic: true`)

| Archivo | Filas Ignored | Decisión |
|---|---|---|
| `torneos.ts` | 6 | **ignored por diseño**: son mutantes **estáticos** (literales/regex de Zod) que `ignoreStatic: true` descarta. **0 kills posibles** sin modificar `stryker.conf.mjs` (prohibido en este change). Los tests de `tests/unit/validations/torneo.test.ts` ya cubren los bordes (`mipRelGap` 0/1/±, tipos inválidos, `include=slots`); si se desactivara `ignoreStatic`, ese mismo spec los mataría. |

### `lib/torneos/limits.ts` — 0 sobrevivientes ✅

| Estado | Filas | Nota |
|---|---|---|
| Killed | 15 | `tests/unit/validations/torneo.test.ts` (clamp 30 s–240 s, env, bordes) ya lo mantiene limpio. |
| CompileError | 14 | Instrumentación (no son supervivientes). |
| Ignored | 1 | Estático por `ignoreStatic`. |

### `lib/torneos/dispatch.ts` — 5 Sur + 0 NoCov = 5 filas

Archivo de test: `tests/unit/torneos/dispatch.test.ts` (ampliado).

| Línea | Patrón | Clasificación | Assert nuevo |
|---|---|---|---|
| `58` | `NEXT_PUBLIC_BASE_URL?.trim()` | **killed** | env/baseUrl con espacios ⇒ URL recortada |
| `74-77` | `set({...})` → `{}` | **killed** | payload del `UPDATE` tiene `lastDispatchAt: Date` |
| `75` | `dispatchAttempts` SQL → `""` | **killed** | **3g corrige el claim**: `payload.dispatchAttempts !== ""` no distingue el mutante (`sql``` es un objeto SQL vacío, no `""`). Ahora se renderiza con `new PgDialect().sqlToQuery(...)` y se asertan `dispatch_attempts` y `+ 1`. |
| `91` | Mensaje `console.error` sin URL | **killed** | `expect(console.error).toHaveBeenCalledWith(stringContaining("Sin URL"), ...)` |
| `122` | Mensaje `console.error` de fallo de red | **killed** | `stringContaining("Fallo")` |
| **Total** | | **5 killed · 0 equivalent · 0 excluded** | |

---

## Verificación (solo mis tests, sin Stryker)

| Check | Resultado |
|---|---|
| `npx jest tests/unit/motor-torneo/{courts,solver-parity}.test.ts tests/unit/torneos/dispatch.test.ts tests/unit/validations/torneo.test.ts` | **43 pasan, 1 skip** (4 suites) |
| `npx tsc --noEmit` | **0 errores** |
| `pnpm run lint` | **0 errores** (286 warnings preexistentes) |
| `lib/**` / `stryker.conf.mjs` | **sin cambios** (AC-08) |
| Cobertura lines | `courts.ts` 100 % · `engine.ts` 100 % · `dispatch.ts` 100 % · `solver.ts` 86.6 % |

> ⚠️ Para el orquestador: los conteos killed/equivalent son la **expectativa** por diseño de asserts; la confirmación definitiva sale de la **corrida combinada** de Stryker (no ejecutada aquí). Entrada: `reports/mutation/mutation-run2.json`.

## 3a — Cierre de triaje (orquestador): 31 filas restantes de model + diagnostics

Corrida de verificación combinada 3a+3b → **87.16%**. De las 182 filas de entrada, quedaban 31.
**30 equivalentes + 1 killed** (tabla de token exacto: archivo:línea:columna):

| Token mutado | Mutator | Decisión | Justificación (1 línea) |
|---|---|---|---|
| model:145 `j < numCols`→`<=` | EqOp | equivalent | `counts[numCols+1]` es OOB en Int32Array → write no-op; el prefijo final ya se calcula en `j=numCols-1` |
| model:152 `k < cols.length`→`<=` | EqOp | equivalent | en `k=length` todos los accesos (`cols[k]`, `cursor[undefined]`, `indices[NaN]`) caen en OOB de typed arrays → no-ops |
| model:163:3 `a.id < b.id`→`<=` | EqOp | equivalent | ids de partidos únicos por construcción → rama de igualdad inalcanzable |
| model:163:22 `a.id > b.id`→`true` | Cond | equivalent | `ToNumber(true)=1` = valor original para `a>b`; para `a<b` el ternario exterior ya retornó −1 |
| model:163:22 `a.id > b.id`→`false` | Cond | equivalent | `a>b` → 0 en vez de 1: inserción binaria estable coloca "igual" y "mayor" en la misma posición con ids únicos |
| model:163:22 `a.id > b.id`→`>=` | EqOp | equivalent | `a==b` inalcanzable (ids únicos) → misma señal |
| model:163:22 `a.id > b.id`→`<=` | EqOp | equivalent | `a>b` → false → 0, colocación idéntica a 1 (ver fila anterior) |
| model:195 `m.phase==="previa"`→`true` | Cond | equivalent | los finals entran al bloque pero `m.parejas` es null → bucle vacío, idéntico |
| model:196 `[]`→[garbage] (parejas fallback) | Arr | equivalent | invariante loader R1: previa ⇒ `parejas ≠ null` → fallback muerto |
| model:197 `[]`→[garbage] (pareja fallback) | Arr | equivalent | integridad referencial: toda pareja del match existe en `inst.parejas` |
| model:255 `[]`→[garbage] | Arr | equivalent | invariante loader (igual que 196) |
| model:257 `[]`→[garbage] (partidosPareja base) | Arr | equivalent | el id garbage no tiene vars en `varsDe` → aporta 0 restricciones; mismas R3/DIA |
| model:318:27 `?.`→`.` (alimentador) | OptChain | equivalent | los alimentadores se derivan del bracket → siempre existen en `inst.partidos` |
| model:318:71 `[]` fallback | Arr | equivalent | `gruposOrigen` siempre presente en partidos derivados → fallback muerto |
| model:324 `[]` fallback (partidosDeGrupo) | Arr | equivalent | todo grupo de origen tiene partidos de previa registrados → fallback muerto |
| model:327:16 `.sort()` eliminado | Method | equivalent | las filas de R5 cambian de orden pero el sistema lineal es idéntico (contenidos L3 sin orden) |
| model:327:69 `a[0]-b[0]`→`a[0]+b[0]` | Arith | equivalent | entrada ya ordenada asc por construcción (`permitidos` ascendente) → sort no-op |
| model:329:18 `.sort()` eliminado | Method | equivalent | igual que 327:16 |
| model:329:73 `a[0]-b[0]`→`+` | Arith | equivalent | igual que 327:69 |
| diag:103 `capacity===0`→`false` | Cond | equivalent | sin la rama temprana: `matches>0 ⇒ occupancy=Infinity>1 ⇒ "rojo"` y `matches=0 ⇒ 0 ⇒ "verde"` — mismo resultado en ambos casos |
| diag:151 `"ext"`→`""` (clave creación) | Str | **killed** | **test nuevo**: base+ext mismo día/fase ⇒ 2 tramos separados (fusiona a 1 con el mutante) |
| diag:168 `"ext"`→`""` (clave de matches) | Str | **killed** | mismo test: `if(tramo)` sin else ⇒ los matches del tramo equivocado caen a `undefined` → assertions de `matches` fallan |
| diag:199 `count>1`→`true` | Cond | equivalent | `count≥1` siempre; `count=1` suma `1−1=0` → idéntico |
| diag:199 `count>1`→`count>=1` | EqOp | equivalent | idéntico a la fila anterior |
| diag:214 `[]` fallback (parejas) | Arr | equivalent | invariante loader: previa ⇒ parejas presente |
| diag:215 `?.`→`.` (pareja) | OptChain | equivalent | integridad referencial: la pareja del match existe en `inst.parejas` |
| diag:261 `""`→sentinela (dayLabel) | Str | equivalent | el fallback solo alimenta `Set.size`/membership: cualquier string único produce el mismo resultado (validado: NoCoverage = inválido nunca asignado en M1) |
| diag:291 `[]`→[garbage] (parejas) | Arr | equivalent | invariante loader (previa ⇒ parejas presente) |
| diag:321 `?.`→`.` (partido) | OptChain | equivalent | `matchId` proviene de `partidosPotenciales` (derivado de `inst.partidos`) → siempre existe |
| diag:322 `!==undefined`→`true` | Cond | equivalent | dominio M1: `finishRun` persiste TODOS los slots → `bloqueDe` completo para previa → la condición siempre true |
| diag:329 `i<n`→`i<=n` | EqOp | equivalent | iteración extra: `blocks[n]=undefined` ⇒ compara false ⇒ `run=1` y `best=max(best,1)` sin efecto (short-circuit evita `blockAt`) |

Tests agregados en 3a (además de los del sub-agente): determinismo de `buildModel` ante reordenación de
`partidos` (regresión R-04, no mata mutante actual) + tramo ext separado (mata 151/168).

## Sub-tarea 3f — `objective.ts` + `types.ts` (hueco de reconciliación)

Corrida de referencia: `reports/mutation/mutation.json` (score 83.89%). 30 filas supervivientes/NoCoverage
nunca triadas. Tests nuevos: `tests/unit/motor-torneo/objective.test.ts` y `tests/unit/motor-torneo/types.test.ts`
(2 archivos; `model.test.ts` intacto). Nada de `lib/**` ni `stryker.conf.mjs` tocado.

### `lib/motor-torneo/objective.ts` — 16 filas

| fila:col | token | decisión | justificación |
|---|---|---|---|
| 14:19 | `fronteraSabado: true` | killed | `toEqual` exacto de `DEFAULT_PARAMS` |
| 18:23 | `disponibilidadDura: true` | killed | idem |
| 19:16 | `dobleDuraEn: ["8vos"]` | killed | idem (array literal) |
| 57:22 | `.sort()` de `diasPrevia` | killed | instancia con días Sab/Jue insertados al revés: `d[A,Jue]` debe ir antes que `d[A,Sab]` |
| 58:72 | fallback `dayLabel ?? ""` | killed | previa con `dayLabel` undefined ⇒ nombre `d[A,]` |
| 94:16 | `integer:false` de `mx` | killed | `integrality[mx]=0` |
| 100:16 | `integer:false` de `mn` | killed | `integrality[mn]=0` |
| 109:23 | `mn` coef `-1` | killed | `rowCoefs(MN[…])["mn[…]] = -1` |
| 117:21 | `.filter(previa)` de `partidosPotenciales` | killed | P1 con 3 previas (≤ maxSeguidos) + 1 final: sin filtro entra al bloque `e` |
| 118:16 | `phase === "previa"` → true | killed | idem |
| 120:9 | `matches.length <= k` → false | killed | idem: 3 previas = maxSeguidos ⇒ `e[]` vacío |
| 120:9 | `<=` → `<` | killed | idem (igualdad exacta 3 vs 3) |
| 129:20 | `integer:false` de `e` | killed | `integrality[e]=0` |
| 132:52 | `e` coef `-1` | killed | `rowCoefs(SEG[…])["e[…]] = -1` |
| 135:48 | acumulador `+1` → `-1` | killed | cada `x` del row `SEG` vale `1` |
| 149:16 | `integer:false` de `f` | killed | `integrality[f]=0` (+ costo `W_FINAL_TEMPRANA`) |

Conteo: **16 killed / 0 equivalent**.

### `lib/motor-torneo/types.ts` — 14 filas

| fila:col | token | decisión | justificación |
|---|---|---|---|
| 296:10 | `.sort()` de `partidosFase` | killed | inserción Z,M,A ⇒ devuelve A,M,Z |
| 298:22 | `a.id < b.id` → false | killed | idem (sin `-1` queda desordenado) |
| 298:22 | `<` → `<=` | killed | dos partidos con id igual: `-1` vs `0` altera el orden estable |
| 298:36 | `-1` → `+1` | killed | signo invertido ⇒ orden descendente |
| 298:41 | `a.id > b.id` → true | equivalent | el comparador solo se usa por signo; para `a>b` original y mutante devuelven `>0` |
| 298:41 | `a.id > b.id` → false | equivalent | idem: `1`→`0`, ambos no negativos, mismo resultado de `sort` |
| 298:41 | `>` → `>=` | equivalent | idem: solo cambia el caso `a==b`, que en un `Record` por id no ocurre |
| 298:41 | `>` → `<=` | equivalent | idem: intercambia `1`/`0` (no negativos) para `a>b` |
| 303:10 | `.sort()` de `personasDoble` | killed | inserción P2,P1 ⇒ devuelve P1,P2 |
| 317:24 | `return []` → `["Stryker was here"]` | killed | persona inexistente ⇒ `[]` |
| 317:7 | `!persona` → false | killed | idem (sin guard lanza TypeError) |
| 320:5 | `.filter(Boolean)` de `misGrupos` | equivalent | los `undefined` que agrega no matchean ningún `grupo` string de `gruposOrigen` |
| 325:10 | `.sort()` de `partidosPotenciales` | killed | inserción z,b,a ⇒ devuelve ["a","b"] |
| 328:36 | `(partido.parejas ?? [])` → `["Stryker was here"]` | equivalent | el reemplazo nunca está en `misParejas`; previa sin parejas ⇒ mismo `false` |

Conteo: **8 killed / 6 equivalent**.

### Totales

- Filas triadas: **30** (16 objective + 14 types).
- Killed: **24** (16 + 8).
- Equivalent: **6** (todas en el comparador de `partidosFase` y dos ramas defensivas de `partidosPotenciales`).
- Verificación: `npx jest tests/unit/motor-torneo/` 11 suites / 209 passed, `npx tsc --noEmit` 0, `pnpm run lint` 0 errores.

---

## Sub-tarea 3g — kills reclamados que FALLARON (corrida final 83.89 %)

> Entrada: `reports/mutation/mutation.json` (corrida final). Se extrajeron **todos** los sobrevivientes de
> `solver.ts` (12 Sur + 22 NoCov), `dispatch.ts` (1 Sur), `loader.ts` (17 Sur + 6 NoCov) y `verify.ts` (12 Sur + 3 NoCov).
> **AC-08 respetado: 0 líneas en `lib/**` y 0 en `stryker.conf.mjs`.** Sólo 4 archivos de test.

### Reclamos erróneos (la tabla decía «killed» y el mutante sobrevive)

| Archivo:línea | Mutante | Por qué NO mataba | Resolución 3g |
|---|---|---|---|
| `solver.ts:34` | `cond→false` | `highs.infinity === Infinity` ⇒ `toHiGHSBound` es la identidad | **reclasificado equivalent** (verificado con el WASM) |
| `solver.ts:35` | `cond→false` | ídem (`-Highs.infinity === -Infinity`) | **reclasificado equivalent** |
| `solver.ts:47` | `cond→true` (NoCov ×2) | la única cobertura de L47 es el caso *unbounded* | **excluded (coste)** — exige status de límite |
| `solver.ts:55-57` | `BlockStatement {}` | línea fuera del rango `51-54` de la tabla | **excluded (coste)**, misma justificación |
| `solver.ts:156` | template `""` | nadie asertaba el mensaje | **kill**: `message` contiene «sin solución primal» |
| `dispatch.ts:75` | `sql` → `sql``` | `!== ""` no distingue: el mutante es un `SQL` vacío, no `""` | **kill**: `new PgDialect().sqlToQuery(...)` contiene `dispatch_attempts` y `+ 1` |
| `loader.ts:257` | `>= 10` | el fixture usaba 12 chars (ambos lados fallan) | **kill**: grupo de exactamente 10 chars ⇒ `ok:true` |
| `loader.ts:285` | `join(", ")→""` | el fixture tenía 1 sola categoría previa | **kill**: test de 3 categorías («1ra, 2da y 3ra») |
| `loader.ts:396/397` | `?? → &&` | A y B bloqueaban **los mismos** bloques ⇒ el otro lado seguía bloqueando todo | **kill**: dos fixtures asimétricos (sólo A / sólo B) |
| `loader.ts:412` | `cond→false`, `*→/` | el caso 601 dispara antes `matches > 600` | **kill**: 600 partidos × 298 bloques = 178 800 casillas |
| `verify.ts:23` | `cond→true`, `>=`, `<=` | el fixture tenía 2 `missing` en orden que el comparador constante preservaba | **kill**: dos órdenes no monótonos (uno con los `missing` descendentes) |
| `verify.ts:146/148/149/152` | loop `cubiertos`, `add`, `cond→true` | los grupos siempre quedaban fuera del margen del final | **kill**: fixture manual (semi b2 cubre `C1-G1`, final b0, grupos b0) ⇒ 3 errores vs 2 |

### Líneas no mencionadas (clasificadas)

- `loader.ts:247` (`cond→false`, `>= 10`) — `cond→false` **equivalent** (schema `max(10)` ⇒ >10 inalcanzable); el `>=` **killed** con categoría de 10 chars (el error pasa a ser de la categoría, no del grupo).
- `solver.ts:153:17` — **equivalent**: sin incumbente HiGHS no emite `mip_gap` ⇒ ambas ramas `null`; `153:69` **NoCoverage excluded (coste)**.
- `verify.ts:152:81` (`?? []` NoCov), `149:71` (`["Stryker was here"]`), `126:47`, `101:28` — **equivalent** (invariantes de `deriveStructure`).

### Verificación (sólo mis tests, sin Stryker)

| Check | Resultado |
|---|---|
| `npx jest …solver-parity …dispatch …loader …verify` | **100 pasan, 1 skip** (4 suites) |
| `npx tsc --noEmit` | **0 errores** |
| `pnpm run lint` | **0 errores** (288 warnings preexistentes) |
| `lib/**` / `stryker.conf.mjs` | **sin cambios** (AC-08) |

> La confirmación de los kills corregidos sale de la próxima corrida Stryker del orquestador (no ejecutada aquí por diseño).
