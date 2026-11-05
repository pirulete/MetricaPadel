# GATE F1 — Spike HiGHS WASM (bloqueante)

> change_id: `2026-11-04-motor-torneo-ts`
> fecha: `2026-11-04`
> Modalidad: **local approximada** (decisión del usuario — el entorno no tiene vercel CLI/token/proyecto vinculado; la validación en invocación real de Vercel queda como pendiente de deploy).
> Log completo: evidencia en `gate-f1.log` (corridas `scripts/torneo-smoke.ts`).

## Resultados vs umbrales (technical-design §12.1)

| Métrica | Umbral | Resultado | Estado |
|---|---|---|---|
| `verify()` caso de referencia | 0 errores | **0** | ✅ |
| Slots (partidos asignados) | 247 (155+92) | **247/247** (bloque + cancha) | ✅ |
| L3 `nVars`/`nConstraints` vs Python | iguales | **5020 / 6604 / 56683** exactos (familias idénticas) | ✅ |
| Wall time (load + build + solve) con `timeLimitMs=240000` | ≤ 270 000 ms | **241.54 s** (solver 240.16 s + 1.38 s load/build) | ✅ |
| RSS pico | ≤ 1024 MB | **378 MB** | ✅ |
| Cold start (load WASM + build modelo) | ≤ 10 000 ms | **≈1.4 s** (wall − solver en ambas corridas: 31.55−30.15 y 241.54−240.16) | ✅ |
| Bundle chunk server con `highs` | ≤ 10 MB | paquete `highs@1.15.4` = **3.7 MB** (`highs.wasm` 3.53 MB + js 168 KB); confirmación final del chunk server en el build del harness | ✅ (parcial — ver nota) |
| Plan Hobby (60 s) | descartado | requiere Pro/Fluid (timeLimit 240 s) | ✅ |

## Notas y observaciones

1. **Corrida `--time 1` (31.55 s)**: HiGHS no respeta límites de tiempo muy chicos (fase raíz/cuts sin chequeo fino) — con `timeLimit=1s` corrió 30.15 s. **No afecta el gate**: en el escenario real (240 s) el exceso total sobre el presupuesto fue de 1.54 s. El cold start real (load + build) es ≈1.4 s.
2. **Persistencia de 247 slots**: el smoke asigna en memoria; la persistencia real ocurre vía `finishRun` (unit-testeada, 30/30 en F0c) y se verifica E2E en F5 (`tests/api/torneos/*` happy-path SQL real). Adaptación documentada del gate local.
3. **Bundle**: medido a nivel de paquete npm. El corte exacto del chunk server se confirma con `npx next build` en la validación post-implementación (Step 5 del workflow).
4. **Calidad de la solución** (no es métrica de gate): objective 13115 @240 s con gap 0.255 en corrida local; gap 0.903 en la corrida de F1b bajo host al 131% CPU. El gap reportado por HiGHS en WASM single-thread progresa más lento que el nativo de Python — a validar en deploy real.
5. **Plan B (contenedor)**: no se activa. Queda cableado vía `TOURNAMENT_WORKER_URL` si el deploy real de Vercel incumple cualquier métrica.

## Veredicto

**✅ GATE F1 PASA (local approximado)** — se autoriza F2+.
Pendiente post-deploy: re-validar wall/cold-start/bundle en invocación real de Vercel.
