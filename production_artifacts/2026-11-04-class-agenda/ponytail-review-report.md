# Ponytail Review — Agenda de clases (2026-11-04-class-agenda)

> Revisión de simplicidad sobre el diff de la feature de agenda (excluye `production_artifacts/`).
> Escalera aplicada: YAGNI → plataforma nativa → dependencias existentes → regla de la línea única.
> Sin dependencias nuevas, sin cambios de contrato en route handlers, sin tocar specs E2E/API.

## Archivos revisados

| Archivo | L | Resultado |
|---|---|---|
| `lib/padel/class-agenda.ts` | 309 | + `addDays`/`daysBetween` (consolidan 3 copias); resto intacto |
| `lib/padel/agenda-group-id.ts` | 33 | mínimo, sin cambios |
| `lib/validations/class-agenda.ts` | 111 | − `daysBetween` local, −8 type aliases muertos, −4 `export` innecesarios |
| `lib/notifications/agenda.ts` | 126 | mínimo (copy por evento + push best-effort), sin cambios |
| `lib/db/queries/padel/class-agenda.ts` | 303 | usa `buildWeekInfo`/`buildMaterializationPlan`/`resolveCapacityRemaining`; + `toCourseBlockDto` |
| `lib/db/queries/padel/class-agenda-blocks.ts` | 386 | capacidad vía `validateAssignment` |
| `app/api/courses/[id]/agenda/**` (5 handlers) | ~700 | `toBlockDto` duplicado eliminado; aritmética de fechas delegada |
| `app/api/student/agenda/**` | 2 | sin cambios |
| `hooks/use-class-agenda.ts` | 411 | − cache `Map` muerta, − `remaining`/`addDays` locales |
| `components/padel/agenda-week-list.tsx` | 252 | − bloque "Añadir bloque suelto" (prop nunca pasada), `STATUS_META` exportado |
| `components/padel/block-assignment-sheet.tsx` | 248 | reutiliza `BLOCK_STATUS_META` |
| `components/padel/upcoming-classes-card.tsx` | 143 | exporta `CLASS_STATUS_META` + `whenLabel` |
| `components/padel/student-course-agenda.tsx` | 251 | reutiliza `CLASS_STATUS_META` + `whenLabel` |
| `components/padel/block-enrollment-row.tsx` | 184 | `studentName()` reutilizado en la fila |
| `components/padel/weekly-slot-manager.tsx`, `enable-week-dialog.tsx` | 368 / 110 | sin recortes justificables |
| `lib/auth/protected-routes.ts` | 665 | excepción documentada (ver abajo) |
| `components/preview/class-agenda.tsx` | — | **eliminado** (mockup efímero sin referencias) |

## Abstracciones eliminadas / simplificadas

1. **Duplicación DTO `toBlockDto`** (idéntico en `agenda/blocks/route.ts` y `agenda/weeks/route.ts`) → una sola `toCourseBlockDto()` en el query layer, que ya calcula `capacityRemaining`/contadores. −16 L.
2. **Materialización reimplementada** en `materializeWeek` (`weekDates` + `flatMap` de candidatos) → `buildWeekInfo()` + `buildMaterializationPlan()` de `lib/padel/class-agenda.ts`, que ya existían y estaban testeados (misma semántica, mismo orden, `skipped` intacto). −19 L netas en la query.
3. **Aritmética de fechas triplicada** (`addDays` en hook + route, `spanDays`/`daysBetween` en route + validations) → una sola implementación pura exportada (`addDays`, `daysBetween`). −14 L.
4. **Capacidad en tres sabores** (inline en `assignStudents`, inline en `listBlocksByRange`, `remaining()` en el hook) → `validateAssignment()` y `resolveCapacityRemaining()` (ya existían, sólo las usaban los tests). Cero lógica nueva.
5. **`STATUS_META` ×4** (2 de bloque, 2 de clase alumno) → 2 constantes exportadas y reutilizadas. −14 L.
6. **`whenLabel` duplicado** → exportado desde `upcoming-classes-card` (donde vive el DTO). −6 L.
7. **`studentName` duplicado** dentro de `block-enrollment-row` → helper reutilizado. −1 L.
8. **Cache local por bloque en el hook** (`React.useRef(new Map())`): muerta — `GET` de detalle (A8) siempre recarga y el sheet muestra skeleton mientras tanto, así que el valor cacheado nunca se renderiza. Eliminada (ref + 4 `set`). −10 L y un estado mutable menos.
9. **`onAddBlock` + botón "Añadir bloque suelto"**: prop opcional que ningún consumidor pasa y sin endpoint de UI previsto → rama muerta eliminada. −12 L.
10. **`lib/validations/class-agenda.ts`**: 8 type aliases (`WeeklySlotPayload`, `BlockUpdatePayload`, …) y `BlockRangeQuery` sin consumidores; 4 schemas internos exportados sin uso externo. −10 L.
11. **`components/preview/class-agenda.tsx`**: mockup efímero del @ui-designer, sin ruta ni import; su propio header dice "se elimina al implementar". Eliminado (única pérdida: nada, no es código de producción).

## Net de líneas

- Código de producción (feature, excluye mockup): **≈ −40 L netas** (sin contar el mockup).
- Mockup efímero eliminado: ~450 L no versionadas.
- Sin archivos nuevos, sin dependencias nuevas.
- Archivos >500 L: ninguno entre los de la feature (`use-class-agenda` 411, `weekly-slot-manager` 368, `class-agenda` 309). `protected-routes.ts` 665 L y `lib/db/schema.ts` son registros (excepción).

## Beneficio

- Una sola fuente de verdad para: capacidad (D5/D10), materialización semanal (D7), aritmética de fechas y DTOs de bloque. Los unit tests de `validateAssignment`/`resolveCapacityRemaining`/`buildMaterializationPlan` ahora cubren el código que corre en producción (antes sólo cubrían copias muertas → falso verde).
- Menos estado mutable en el hook (sin cache espejo): el server sigue siendo la única autoridad y el sheet se hidrata con el `GET` que ya existía.
- Sin cambios de contrato: mismos status codes, mismos payloads, mismas claves de error (`AGENDA_*`), misma auditoría y mismas notificaciones.

## Excepciones (no se recortó)

| Elemento | Motivo |
|---|---|
| `lib/auth/protected-routes.ts` (665 L) | **Registro de datos** (objeto `routeProtection` endpoint → guard/estados), mismo perfil que `lib/constants/*`. Cero lógica ejecutable; dividirlo rompería la lectura única que exige el gate `--docs` de `scripts/validate-harness.js` y añadiría barrels sin valor. Excepción aceptada. |
| `lib/db/schema.ts` (registro de tablas/enums) | Excepción estándar de `AGENTS.md` (definiciones de schema). |
| `lib/api-docs/spec.ts` + `paths|schemas/class-agenda*.ts` | Registro de documentación; no es lógica a simplificar. |
| `computeAttendanceAggregates` (sin uso runtime) | Mandato explícito del technical design (AC-06 / §3.2) y del gate de unit tests. La agregación real es SQL (`getStudentAggregates`); la función pura queda como especificación testeada. Se documenta como deuda consciente en lugar de borrarla (borrarla alteraría acceptance criteria). |
| `isUniqueViolation` ×3 y `toSlotDto` ×2 en route handlers | Convención ya existente en el repo (`app/api/admin/users/route.ts` tiene su propia copia). Extraerlo exigiría un módulo compartido para 3 líneas y tocar handlers fuera del alcance. Aceptado. |
| `function today()` ×5 en handlers | 1 línea por handler; exportarla obligaría a leer `process.env` en `lib/padel/class-agenda.ts`, que es **client-safe por contrato (D19: cero `process.env`)**. Aceptado. |
| Formateo de fechas con `toLocaleDateString("es-ES")` (hook + day heading) | Plataforma nativa (Intl) — preferible a tablas propias. `lib/date-utils.ts` es Chile/StreetMove (wall-clock `America/Santiago`), inaplicable aquí. Sin cambios. |
| `student-course-agenda` fetch manual (vs React Query) | El repo no tiene React Query/SWR; el patrón hook+fetch ya es el estándar (`use-notifications`, `use-academies`). No se introdujo abstracción nueva. |
| `blockEnrollmentStatusEnum` vs `classBlockStatusEnum` (mismos valores) | Cambiarlo requiere migración de enum con datos; fuera de alcance de un refactor de simplicidad. |

## Verificación

- `npx tsc --noEmit` → 0 errores.
- `npx eslint` sobre los 13 archivos tocados → 0 errores.
- `npx jest tests/unit/padel/class-agenda.test.ts tests/unit/validations/class-agenda.test.ts tests/unit/notifications/agenda.test.ts tests/unit/padel/agenda-group-id.test.ts` → 4 suites / 63 tests OK (cobertura `class-agenda.ts` 96.7%).
- No se ejecutó `next build` ni Playwright (regla anti-loop). Specs E2E/API intactos.
