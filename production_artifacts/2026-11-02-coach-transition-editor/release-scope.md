# Release Scope — Editor de Transiciones de Pádel (profesores)

> status: proposed
> release: por confirmar
> date: 2026-11-02
> change_id: 2026-11-02-coach-transition-editor
> module: padel
> tags: [ui, editor, canvas, mobile, db, api]
> spec: `./feature-spec.md`

---

## 1. Entra

| # | Entregable | Módulo |
|---|-----------|--------|
| 1 | Tabla única de transiciones (escenario `CourtScenario` en JSON + `title` + `ownerId` + timestamps) + migración Drizzle generada | DB |
| 2 | API CRUD `/api/transitions` (+ `/[id]`) contract-first, Zod, `guardAdmin`, auditoría, ownership anti-IDOR 404, entrada en `lib/api-docs/spec.ts` | API |
| 3 | Ruta privada del editor `ADMIN` declarada en `lib/auth/protected-routes.ts` | auth |
| 4 | Pantalla de **lista** de transiciones del profesor (mis transiciones, empty state, crear/abrir) | UI |
| 5 | **Editor mobile-first**: canvas con selección y drag, toolbar flotante (±0.5 m, fijar/borrar tiro), manija de arco, filmstrip (añadir/duplicar/borrar/reordenar), undo/redo | UI |
| 6 | **Preview/Probar** reutilizando `components/court/` + `lib/padel/court/` (cero animación nueva) | UI |
| 7 | Tests: unit (lógica pura + validaciones + queries), API guard + happy-path con SQL real, ≥1 E2E navegable a 375×667, E2E 403 para USER | QA |
| 8 | `FEATURES.md` con entrada y metadata; `ARCHITECTURE.md` si el schema/API lo exige | docs |

## 2. No entra

- Visor de transiciones para alumnos (ni asignación a cursos, ni notificaciones).
- Editor optimizado para escritorio.
- Poses, orientación/facing de jugadores (dirigir = **destino + arco**).
- Plantillas, biblioteca compartida, clonado entre profesores.
- Colaboración multi-profesor en una transición.
- Exportación a vídeo/GIF/PDF.
- Historial de revisiones de una transición.
- Modificaciones al contrato `CourtScenario`/`Paso` existente.
- Nuevas dependencias npm (se usan `konva`, `react-konva`, `vaul`, `sonner`, `zod`, `drizzle-orm` ya presentes).

## 3. Plan de fases

| Fase | Contenido | Agente | Gate de salida |
|------|-----------|--------|----------------|
| **F0 — Diseño** | Mockup navegable mobile-first del editor (canvas + toolbar + filmstrip + estados) y auditoría del UI kit | @ui-designer | `design-approved.md` + aprobación del usuario |
| **F1 — Schema** | Tabla de transiciones, campos, índices (`ownerId`, `updatedAt`), migración vía `db:generate`, queries con ownership | @db-engineer | Migración aplicada + verificación de columnas + unit tests de queries |
| **F2 — API** | Contratos contract-first en `lib/api-docs/spec.ts` + route handlers + Zod + `guardAdmin` + auditoría + anti-IDOR | @architect (contratos) → @app-engineer + @auth-security (guards/audit) | `tsc` 0 + API guard/happy-path verdes + IDOR 404 |
| **F3 — Editor UI** | Canvas Konva con selección/drag, toolbar contextual, manija de arco, filmstrip, undo/redo, estados empty/loading/error | @app-engineer | Unit tests de lógica pura + E2E móvil parcial |
| **F4 — Preview** | Botón Probar reutilizando `CourtStage`/`resolveHitter`; sin lógica de animación nueva | @app-engineer | Revisión de imports + E2E de reproducción |
| **F5 — Simplificación y QA** | @ponytail-reviewer (diff mínimo), luego regresión completa | @ponytail-reviewer → @qa-release | `typecheck`/`lint`/`build` 0, unit+API+E2E verdes, cobertura sin regresión >3%, `FEATURES.md` actualizado, `evidence-manifest.json` |

## 4. Impacto por agente

| Agente | Impacto | Archivos esperados (orientativo) |
|--------|---------|----------------------------------|
| **@pm** | Spec + scope + `FEATURES.md` metadata | `production_artifacts/2026-11-02-coach-transition-editor/*`, `FEATURES.md` |
| **@ui-designer** | Mockup mobile-first del editor (375×667), 2–3 alternativas, estados y targets ≥44px | `components/preview/*` (efímero), `design-exploration.md`, `ui-kit-audit.md`, `mockup-spec.md`, `design-approved.md` |
| **@architect** | Contratos API (paths + schemas), change-map con chunking (>5 archivos → split), decisión de `version`/soft-delete | `technical-design.md`, `change-map.md`, `lib/api-docs/spec.ts` (estructura) |
| **@db-engineer** | 1 tabla nueva + índices + migración + queries con `ownerId` | `lib/db/schema.ts`, `lib/db/queries/padel/transitions.ts` (nuevo), `drizzle/00XX_*.sql`, `tests/unit/db/transitions-queries.test.ts` |
| **@auth-security** | `guardAdmin` en todos los endpoints, declaración `ADMIN` (nunca LOCKED) en `protected-routes.ts`, eventos de auditoría | `lib/auth/protected-routes.ts`, `lib/audit/helpers.ts`, `tests/api/padel/transitions-guard.spec.ts` |
| **@app-engineer** | Editor + lista + hooks + route handlers + wiring | `app/(app)/transiciones/**`, `app/api/transitions/**`, `components/padel/transition-editor/*`, `hooks/use-transitions.ts`, `lib/validations/padel.ts`, `lib/api-docs/paths|schemas/transitions.ts`, `tests/unit/padel/transition-editor.test.ts`, `tests/api/padel/transitions-happy.spec.ts`, `tests/e2e/transition-editor.spec.ts` |
| **@ponytail-reviewer** | Reducir abstracciones (reducers/hook layers), verificar diff mínimo | `ponytail-review-report.md` |
| **@qa-release** | Regresión completa, E2E móvil, cobertura, `FEATURES.md` verificado | `release-report.md`, `test-matrix.md`, `acceptance-criteria.md`, `evidence-manifest.json` |

**Chunking obligatorio**: si un agente acumula >5 archivos o >400 líneas, @architect marca `split` en `change-map.md` y el orquestador lo invoca en sub-tasks ≤5 archivos (regla de AGENTS.md).

## 5. Seguridad y guard (nota obligatoria)

- La ruta del editor (`app/(app)/transiciones/**`) **declara `ADMIN`** en `lib/auth/protected-routes.ts`; `ACTIVE` requerido, `TEMPORARY` y `USER` → **403**, `LOCKED` **nunca** permitido.
- Todos los endpoints `/api/transitions/**` usan `guardAdmin` server-side (nunca checks client-side) y filtran por `ownerId` de sesión; recurso ajeno → **404**.
- Mutaciones (POST/PUT/DELETE) escriben en `audit_logs` vía `lib/audit/helpers.ts`.
- E2E dedicado verifica el `403` para `USER`.

## 6. Riesgos de release

- **UX táctil** es el mayor riesgo de adopción: no se libera sin mockup aprobado y E2E a 375×667.
- **Scope creep** hacia "alumnos ven la transición": fuera de alcance, requiere spec nuevo (`change_id` propio).
- **Cobertura**: la lógica debe vivir en `lib/padel/` (pura y testeable), no dentro de componentes Konva.

## 7. Criterio de "done"

Todos los AC de `feature-spec.md` verificados, gates del repo verdes, `evidence-manifest.json` generado, `FEATURES.md` con la entrada `change_id: 2026-11-02-coach-transition-editor`, y commit a `rama-preview` (el merge a `main` queda para `/supercommitpro`).
