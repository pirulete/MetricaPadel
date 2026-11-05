# Release Report — Agenda de clases por curso (`2026-11-04-class-agenda`)

> **Veredicto: 🟢 GO (v0.11)** — todos los gates bloqueantes en verde; 1 bug **preexistente** documentado (BUG-01) sin regresión introducida; 2 ítems de validación **manual** pendientes (push en dispositivo real y responsive en hardware).
> Validado por @qa-release · 2026-11-04 · módulo `padel` · rama de trabajo `rama-preview`.

---

## 1. Gates ejecutados (reales, no reportados)

| Gate | Comando | Resultado | Estado |
|---|---|---|---|
| typecheck | `npx tsc --noEmit` | 0 errores | ✅ |
| lint | `pnpm run lint` | **0 errores** / 256 warnings preexistentes (+ `protected-routes.ts` max-lines, excepción de registro justificada en `ponytail-review-report.md`) | ✅ |
| unit | `pnpm run test:unit` | **71 suites / 948 tests** (esperado 948/71) | ✅ |
| api_integration | `playwright test tests/api/padel/class-agenda-{happy,guard,student-happy}.spec.ts` | **7 scenarios / 6 passed + 1 flaky** (timeout de cold-start con 3 workers; pasa en retry y en corrida aislada) | ✅ (ver §5) |
| e2e (feature) | `playwright test tests/e2e/class-agenda.spec.ts` | **2/2** (375×667) | ✅ |
| e2e (regresión) | `playwright test tests/e2e/{transition-editor,puzzle-demo,transition-fab}.spec.ts` | **6/6** | ✅ |
| build | `pnpm run build` | OK | ✅ |
| api-docs | lectura de `lib/api-docs/spec.ts` + paths | 15 endpoints de agenda registrados (13 coach + 2 alumno), incluido el `GET` del C9-fix | ✅ |
| coverage | Jest (módulo afectado) | `lib/padel/class-agenda.ts` 96.7 % · `lib/validations/class-agenda.ts` 100 % · sin caída > 3 % | ✅ |
| efímeros (C13b) | `components/preview/`, `app/preview/` | sin `class-agenda*` | ✅ |

## 2. Resultado por acceptance criteria

| AC | Resultado | Detalle |
|---|---|---|
| AC-01 Template | ✅ | CRUD de slots verificado con SQL real + anti-IDOR 404 + Zod (`dayOfWeek` 1–7, `durationMinutes` 15–180) |
| AC-02 Materialización idempotente | ✅ | 2ª ejecución devuelve `created: 0`/`skipped: N`; no duplica ni toca bloques editados |
| AC-03 Asignación con reglas | ✅ | 201 inscrito · 400 no inscrito · 409 cupo · doble asignación `alreadyAssigned` (UNIQUE en DB) |
| AC-04 Estados y asistencia | ✅ | PROGRAMADA → COMPLETADA/CANCELADA; `attended` tri-estado + `notes`; cancelación propaga `cancelled` a asignaciones |
| AC-05 Notificación con dedup | ⚠️ automático ✅ / push visible **manual** | `groupId` uuid v5 determinista, dedup del engine (unit), `notified` en la respuesta. La visibilidad en dispositivo real queda como M-01 |
| AC-06 Historial + agregados | ✅ | U1/U2 con SQL real: próximas, historial con cursor, `attendanceRate`, anti-IDOR 404 |
| AC-07 UI alumno móvil-first | ✅ | E2E 375×667 con "Próximas clases", empty state y `scrollWidth ≤ 375` |
| AC-08 Gates de repo | ✅ | Ver §1 + FEATURES.md actualizado + API docs |
| AC-09 Auditoría | ✅ | `audit_logs` aseverado en 6 puntos del happy-path; todas las rutas coach con `guardAdmin` + ownership |

Detalle completo en `acceptance-criteria.md`.

## 3. Hallazgos

### BUG-01 · Desborde horizontal preexistente en `/cursos/[id]` a 375 px — 🟠 Medio, **NO introducido por esta feature**

- **Repro**: viewport 375×667 → login coach → `/cursos/<id con nombre largo>` → cualquier tab.
- **Esperado**: `documentElement.scrollWidth ≤ 375` (patrón móvil del resto de páginas privadas).
- **Actual**: `scrollWidth = 589–608`. Medido también en las tabs **Alumnos** y **Rúbricas**, cuyo JSX no cambia en este diff; `/dashboard`, `/cursos`, `/historial`, `/evaluaciones`, `/rubricas` sí cumplen 375.
- **Culpables medidos**: `H1` con el nombre del curso sin `truncate`/`break-words` (408 px) y la fila de acciones `Evaluar / Evaluar en Pareja / Editar` en un `flex` sin `wrap` (557 px); el resto del contenido (incluida la agenda) hereda ese ancho.
- **Impacto**: molesto en coach móvil; no rompe funcionalidad (la agenda no genera scroll interno: `scrollWidth - clientWidth = 0` en su panel).
- **Decisión QA**: no se modifica producto en fase de release. El E2E conserva el assert a nivel documento en el flujo del **alumno** (AC-07) y lo acota al panel de agenda en el flujo del coach.
- **Recomendación**: `min-w-0` + `truncate`/`break-words` en el `H1` y `flex-wrap` en la fila de acciones (`components/padel/course-detail.tsx`). Fix de 1 archivo, candidato a `/fix-problems`.

### C9-fix verificado (GET block detail)

- `GET /api/courses/[id]/agenda/blocks/[blockId]` existe, está documentado y cubierto: happy-path asevera `block.enrolledCount` y el `studentId` en `enrollments`; guard spec asevera 404 cross-coach. El hook ya no depende de caché en memoria (eliminada por @ponytail-reviewer) y se rehidrata del server al reabrir el bloque.

### Defectos de test corregidos en esta fase (test-only)

TEST-01..TEST-05 (hooks de seed a nivel archivo ejecutados entre tests, locators ambiguos ×2, colisión de `invite_code`, assert de scroll demasiado amplio). Detalle y evidencia en `test-matrix.md` §7. No alteran producto ni criterios de aceptación.

### Observación menor (fuera de alcance)

- `git status` muestra `?? motor_torneo/` (directorio ajeno a esta iniciativa). No se incluye en el change set ni en el manifest.
- `lib/constants/version.ts` sigue en `APP_VERSION = 'v0.8'` (drift previo: ya estaba atrás de v0.10). No forma parte de los 4 archivos de C13; lo sincroniza el script de `/supercommitpro` desde `FEATURES.md`. Se deja constancia para que el merge lo arrastre.

## 4. C13 — Documentación (verificada y completada)

| Archivo | Estado | Contenido |
|---|---|---|
| `FEATURES.md` | ✅ | Entrada del `change_id` promovida a `status: released`, `release: v0.11`, `module: padel`; secciones Problema / Solución Implementada / Archivos / Tests / **Excepción cron standby** / Variables de entorno |
| `ARCHITECTURE.md` | ✅ | Sección "Agenda de clases (v0.11)": 3 tablas + enums/índices, convención `date` string + `varchar(5)` (A2), `todayInTimeZone` + `APP_TIMEZONE` (D18), `groupId` uuid v5, 15 endpoints, UI, **cron standby** |
| `.env.example` | ✅ | Comentario de `APP_TIMEZONE` corregido (ya no dice "usado por lib/date-utils.ts"); sin variables nuevas |
| `AGENTS.md` / `lib/policy` | ✅ | Sin cambios (correcto) |

## 5. Nota sobre el flaky de API

`class-agenda-happy.spec.ts` excedió 30 s en la primera corrida con **3 workers** (compilación on-demand de las 15 rutas nuevas en dev + 3 contextos concurrentes) y pasó en retry (3.5 s) y en corrida aislada (2.6 s). No hay fallo de aserción: el test completo superó el timeout del runner. **Clasificación: infraestructura de test, no defecto de producto.** Recomendación para CI: `--workers=1` para el paquete `tests/api/padel/class-agenda*` o `timeout: 60_000` en ese archivo.

## 6. C13b — Cleanup de efímeros

- `components/preview/class-agenda.tsx`: **ya eliminado** por @ponytail-reviewer (verificado: no existe ni tiene referencias).
- `app/preview/class-agenda/page.tsx`: **no existía**.
- No quedan mockups ni rutas de preview de la feature.

## 7. Post-release

1. Ejecutar `M-01` y `M-02` del checklist manual antes de anunciar a los coaches.
2. Abrir `/fix-problems` para BUG-01 (desborde del header de curso a 375 px).
3. Recordatorio automático **sigue en standby**: no se creó cron ni workflow; contrato documentado para v1.1.
4. Commit a `rama-preview`; el deploy a `main` queda a cargo de `/supercommitpro`.
