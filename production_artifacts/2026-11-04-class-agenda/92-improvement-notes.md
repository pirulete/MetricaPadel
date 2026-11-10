# Improvement Notes — `2026-11-04-class-agenda`

> Generado por @qa-validator · 2026-11-04 · observaciones **no bloqueantes** (no afectan el `overall: pass`).

## 1. BUG-01 — Desborde horizontal preexistente en `/cursos/[id]` (375 px)

- **Estado**: preexistente, **no** introducido por esta feature (medido también en tabs cuyo JSX no cambia).
- **Síntoma**: `documentElement.scrollWidth = 589–608` a 375×667.
- **Causa medida**: `H1` con el nombre del curso sin `truncate`/`break-words` (408 px) + fila de acciones `Evaluar / Evaluar en Pareja / Editar` en `flex` sin `wrap` (557 px).
- **Mejora propuesta**: `min-w-0` + `truncate`/`break-words` en el `H1` y `flex-wrap` en la fila de acciones (`components/padel/course-detail.tsx`). Fix de 1 archivo ⇒ candidato a `/fix-problems`, no a release.

## 2. Flaky de API por cold-start (infra de test)

- `class-agenda-happy.spec.ts` excede 30 s en la primera corrida con 3 workers (compilación on-demand de 15 rutas nuevas) y pasa en retry y en corrida aislada. Sin fallo de aserción.
- **Mejora propuesta para CI**: `--workers=1` para `tests/api/padel/class-agenda*` o `timeout: 60_000` en el archivo, o warm-up previo del dev server.

## 3. Drift de versión

- `lib/constants/version.ts` sigue en `APP_VERSION = 'v0.8'` (drift previo, ya atrasado en v0.10). No forma parte de los archivos de C13.
- **Mejora propuesta**: que `/supercommitpro` lo sincronice desde `FEATURES.md` en el merge (comportamiento esperado del script; verificar que efectivamente lo arrastre a `v0.11`).

## 4. Recordatorio automático en standby

- v1 no crea cron ni workflow (`vercel.json` con `crons: []`). Contrato documentado para v1.1: `POST /api/cron/class-reminders` + `CRON_SECRET` + `.github/workflows/cron-external.yml` (`*/30 * * * *`). Activarlo no requiere migración.
- **Mejora propuesta**: planificar v1.1 con `reminderSentAt` para idempotencia y ventana de 24 h.

## 5. Deuda de proceso observada

- Conteo de archivos en `change-map.md` v1 (34 declarados vs 45 reales) corregido en v2 — conviene que @architect valide el conteo contra `git diff --stat` antes de cerrar el mapa.
- `protected-routes.ts` supera el límite de líneas con excepción documentada; evalúa dividir el registro por dominio (auth / padel / marketing) cuando se añada el próximo grupo de rutas.
