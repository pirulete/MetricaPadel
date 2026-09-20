# Task Worksheet — Hoja de Trabajo Retomable

> **Propósito (MVP AOSE #5)**: cualquier tarea puede interrumpirse (timeout, contexto, prioridad). Esta hoja permite retomarla **sin arqueología**: qué se intentó, qué queda, y cómo validar. Un agente que retoma NO debe re-explorar lo ya resuelto.

---

## 1. Identidad

| Campo | Valor |
|---|---|
| Change ID | `YYYY-MM-DD-short-slug` |
| Workflow / comando | ej. `/ship-feature`, `/fix-problems`, manual |
| Fecha inicio | |
| Última actualización | |
| Estado | `in-progress` / `blocked` / `awaiting-input` / `done` |

## 2. Objetivo

> 1-2 líneas: qué se está construyendo o reparando, y el criterio de éxito.

## 3. Archivos afectados

| Archivo | Rol | Estado (`nuevo`/`modificado`/`leer`) |
|---|---|---|
| | | |

## 4. Qué se hizo (para no repetir)

- [ ] Paso 1 — _qué, en qué archivo, resultado_
- [ ] Paso 2 — _si falló, anotar POR QUÉ_

> Regla: si algo ya se investigó y se descartó, escríbelo aquí con 1 línea — un retomador no debe repetir el mismo análisis.

## 5. Qué queda (próximo paso exacto)

- [ ] **Siguiente acción concreta** — _archivo + cambio + validación_
- [ ] Pendiente 2
- [ ] Pendiente 3

## 6. Bloqueadores / decisiones abiertas

| Bloqueador | Impacto | Necesita decisión de |
|---|---|---|
| | | |

## 7. Cómo validar (gates que deben pasar)

- [ ] `npx tsc --noEmit` — 0 errores
- [ ] `pnpm run test:unit` — sin regresiones (ver `test_coverage_delta` en `.validation/status.json`)
- [ ] `node scripts/validate-harness.js --typecheck --lint --tests --build`
- [ ] Gates según riesgo (`--evidence`, `--risk-policy` para HIGH/MEDIUM)
- [ ] Evidencia: `production_artifacts/<change_id>/evidence-manifest.json` con `completionClaim=true`

## 8. Notas de contexto (Engram/patterns relevantes)

> Referencias a mem_save/mem_search, `recurring-issues.md`, o decisiones previas que un retomador debe conocer antes de continuar.

---

### Reglas de retomada

1. Al retomar: leer TODO este archivo antes de tocar código.
2. Si el paso siguiente depende de contexto no documentado aquí, actualizar la sección 4 y 5 antes de actuar.
3. Si algo cambió el estado del repo desde la última actualización (merge, otro change), verificar `git status` y anotar en sección 6.
4. Al completar: mover a la sección 4 los pasos hechos, marcar estado `done`, y generar la evidencia (sección 7).
