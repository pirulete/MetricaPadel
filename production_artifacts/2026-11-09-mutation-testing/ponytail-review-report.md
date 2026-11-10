# @ponytail-reviewer — 2026-11-09-mutation-testing

> Revisión de simplicidad sobre el diff de mutation testing (Stryker). Alcance: nuevos
> configs/tests + tests reforzados. **No** se tocó `lib/**`, ni dependencias, ni criterios
> de aceptación. Ignorados por instrucción: `production_artifacts/` (docs), `.validation/`,
> `reports/`.

## Archivos revisados

| Archivo | Estado | Líneas antes → después | Veredicto |
|---------|--------|------------------------|-----------|
| `stryker.conf.mjs` | nuevo | 0 → 88 | OK (operativo) |
| `jest.config.mutation.js` | nuevo | 23 → 19 | **simplificado (spread)** |
| `tests/unit/motor-torneo/fixtures.ts` | nuevo | 0 → 113 | **nuevo helper compartido** |
| `tests/unit/motor-torneo/model.test.ts` | mod | 493 → 405 | importa fixtures |
| `tests/unit/motor-torneo/objective.test.ts` | nuevo | 252 → 165 | importa fixtures |
| `tests/unit/motor-torneo/verify.test.ts` | mod | 667 → 629 | importa `miniInstance` |
| `tests/unit/motor-torneo/diagnostics.test.ts` | mod | 243 → 900 | sin cambios (ver §3) |
| `tests/unit/motor-torneo/loader.test.ts` | mod | 350 → 900 | sin cambios (ver §3) |
| `tests/unit/motor-torneo/solver-parity.test.ts` | mod | 345 → 551 | OK |
| `tests/unit/motor-torneo/bracket.test.ts` | mod | 221 → 244 | OK |
| `tests/unit/motor-torneo/calendar.test.ts` | mod | 162 → 210 | OK |
| `tests/unit/motor-torneo/{courts,types}.test.ts` | nuevos | 0 → 123 / 149 | OK (helpers locales mínimos) |
| `tests/unit/torneos/dispatch.test.ts` | nuevo | 0 → 218 | OK (reusa `PgDialect` nativo) |
| `tests/unit/validations/torneo.test.ts` | mod | 121 | OK (solo docblock −1) |
| `package.json` / `pnpm-lock.yaml` | mod | +6 / +1168 | solo devDeps/scripts aprobados |
| `.gitignore` | mod | +4 | OK (ver §2.4) |
| `FEATURES.md` | mod | +46 | fuera del alcance pedido; no revisado |

## 1. Abstracciones eliminadas / simplificadas

### 1.1 Fixtures `miniInstance` duplicados en 3 archivos → `fixtures.ts`
`pareja`, `buildInstance`, `MINI_TRAMOS`, `miniInstance` y `objectiveInstance` estaban
copiados en `model.test.ts`, `objective.test.ts` y (versión inline) `verify.test.ts`.
Se extrajeron a `tests/unit/motor-torneo/fixtures.ts` (113 L) y los tres archivos ahora
importan. Elimina 3 copias de la misma construcción de `Instancia`: si cambia el tipo,
se toca un solo sitio.

- `model.test.ts`: −88 L
- `objective.test.ts`: −87 L (conserva `tripleInstance`/`twoDaysInstance`, propias del archivo)
- `verify.test.ts`: −38 L (se reemplazó el `miniInstance` inline; el `buildInstance`
  por mapa de personas del bloque nuevo se dejó local porque tiene otra firma y solo se usa ahí)

### 1.2 `rowCoefs` duplicado (model + objective) → una exportación
Misma función de 9 L copiada en ambos archivos; ahora vive en `fixtures.ts` junto a las
instancias del modelo. `costOf`/`colOf` se dejaron locales: no son la misma operación
(costo vs índice de columna).

### 1.3 `jest.config.mutation.js` derivado con spread de `jest.config.js`
Antes recopiaba a mano `transform`, `moduleNameMapper`, `setupFilesAfterEnv`,
`moduleFileExtensions`, `roots` y `testEnvironment`. Ahora:

```js
const base = require("./jest.config.js");
module.exports = { ...base, testTimeout: 60_000, testMatch, testPathIgnorePatterns, collectCoverage: false, verbose: false };
```

Elimina el drift con `jest.config.js` (no se modifica el original, AC-02) y solo
sobrescribe lo específico del sandbox. Se añadió una directiva `eslint-disable` de una
línea porque el repo prohíbe `require()` (sin ella el gate `--lint` fallaría).

## 2. Evaluado y NO cambiado (justificación)

1. **Helpers locales de `courts.test.ts` / `types.test.ts`** (`partido`, `makeInst`, `bloque`,
   15–30 L): firmas distintas y específicas (uno solo lee `nCanchas`+`partidos`, el otro usa
   `Partial<Instancia>`). Unificarlos exigiría un factory genérico con más parámetros que las
   líneas ahorradas → indirección > beneficio (escalera regla 4).
2. **`mkBloque`/`mkPartido`/`mkPareja`/`mkInstancia` en `diagnostics.test.ts`**: se definen una
   sola vez y se reutilizan en todo el archivo. `mkPartido` solapa con el `partido` legacy, pero
   `mkPartido` acepta `Partial<Partido>` y lo usan ~60 casos; forzar el legacy añadiría ruido.
3. **`.gitignore` `.stryker-tmp-*/`**: candidato YAGNI (`tempDirName` está fijado a
   `.stryker-tmp` y `cleanTempDir: "always"`). Se conserva porque el coste es 1 línea y evita
   reabrir el bug bloqueante M3 (sandbox residual rompiendo `--lint`) si cambia `tempDirName`.
4. **`stryker.conf.mjs > ignorePatterns`**: `node_modules`, `.git` y `*.tsbuildinfo` son
   defaults de Stryker; se dejan explícitos por claridad operativa (0 coste en runtime).
5. **`dispatch.test.ts`**: usa `PgDialect.sqlToQuery` (nativo de la dependencia existente) en
   vez de comparar strings a mano; no hay helper reinventado. Sin cambios.

## 3. Archivos > 500 líneas (regla de tamaño)

Conteo de código (sin blancos/comentarios): `diagnostics.test.ts` 809, `loader.test.ts` 801,
`verify.test.ts` 568. ESLint reporta `max-lines` (warning permitido, no error).

**No se dividieron** — excepción documentada:

- El volumen es **tablas de datos/expectativas** (payloads de schema y mensajes exactos por
  mutante), no lógica: entra en el espíritu de la excepción “archivos de constantes de datos”.
- Mapeo 1:1 archivo ↔ módulo (`diagnostics.ts`, `loader.ts`, `verify.ts`), útil para el triaje
  de mutantes (`enableFindRelatedTests` resuelve por imports, no por nombre de archivo).
- Partirlos exige extraer los builders `mk*` a otro módulo (más archivos/abstracciones) y no
  borra ninguna línea → contradice la regla “borrar antes que añadir”. La duplicación real que
  sí existía ya se eliminó con `fixtures.ts` (verify 667 → 629).

## 4. Métricas

| Métrica | Valor |
|---------|-------|
| Líneas eliminadas (duplicación) | −213 (88+87+38) |
| Líneas añadidas (helper compartido) | +113 |
| Neto en tests | **−100** |
| Neto en `jest.config.mutation.js` | **−4** (23 → 19) |
| **Neto total** | **≈ −104 líneas** |
| Abstracciones eliminadas | 3 (triple copia de fixtures, `rowCoefs` duplicado, config Jest recopiada) |
| Dependencias añadidas por esta revisión | 0 |

Beneficio: una sola fuente de verdad para la `Instancia` mini (los 3 archivos no pueden
desincronizarse), config de mutation sin drift con la de Jest, y −100 líneas de tests sin
perder ni un caso.

## 5. Verificación

| Check | Resultado |
|-------|-----------|
| `npx tsc --noEmit` | **0 errores** |
| `npx jest tests/unit/` | **86/86 suites**, 1236 pass, 1 skipped |
| `npx eslint <archivos tocados>` | **0 errores**, 1 warning `max-lines` (verify, permitido) |
| `npx jest -c jest.config.mutation.js --listTests` | 13 suites, todas del scope; `purity.test.ts` excluido |

## 6. Observación para el orquestador (no alterada)

AC-02/change-map fijan “`--listTests` = **10 suites exactas**”, pero el scope actual lista
**13**: los nuevos `courts.test.ts`, `objective.test.ts` y `types.test.ts` amplían
`motor-torneo/`. Sigue acotado (no corre las ~948 del repo), pero el literal ≤10 ya no se
cumple. Decisión fuera de ponytail: actualizar el criterio en el artifact o fusionar suites.
No se modificó ningún criterio de aceptación.
