# Feature Spec — Editor de Transiciones de Pádel para Profesores

> status: proposed
> release: por confirmar
> date: 2026-11-02
> change_id: 2026-11-02-coach-transition-editor
> module: padel
> tags: [ui, editor, canvas, mobile, db, api]
> owner: @pm
> related: `2026-11-01-konva-puzzle-spike` (motor Konva validado), `/puzzle-demo`

---

## 1. Problema

El coach (ADMIN) ya dispone de un motor de transición de jugadas tipo puzzle validado en el spike (`app/(app)/puzzle-demo`, `components/court/`, `lib/padel/court/`), pero **sólo puede consumir escenarios hardcodeados**. No existe forma de que un profesor **cree, edite y guarde** sus propias transiciones: hoy escribir una jugada requiere tocar código y desplegar. Sin editor, la feature de puzzles no es un producto para coaches.

Además el uso real del profesor ocurre **en la pista, con el móvil en la mano**: cualquier solución que asuma escritorio o interacción de precisión con ratón no se usa.

## 2. Objetivo

Que un ADMIN pueda, **desde el móvil**, componer una transición paso a paso (posiciones de jugadores A–D + pelota + destino/arco del tiro), reordenarla, deshacer/rehacer y **probarla con el mismo motor de animación ya existente**, persistiéndola en DB mediante una API CRUD contract-first, sin duplicar la lógica de animación ni el modelo de datos del escenario.

## 3. Alcance

### In scope

1. **Pantalla de editor mobile-first** en ruta privada nueva (`app/(app)/transiciones/...`), que declara `ADMIN` (y nunca `LOCKED`) en `lib/auth/protected-routes.ts`.
2. **Canvas interactivo con selección**: tap selecciona jugador A–D o pelota; drag mueve el elemento seleccionado en coordenadas de cancha (metros, no píxeles).
3. **Toolbar flotante contextual** anclada al elemento seleccionado: nudges finos ±0.5 m (4 direcciones), fijar tiro, borrar tiro.
4. **Manija de arco arrastrable** sobre la curva del tiro: "dirigir" = **destino + arco** únicamente (sin poses ni facing de jugadores).
5. **Filmstrip inferior** con miniaturas por paso: añadir, duplicar, borrar, reordenar.
6. **Undo/redo** de la sesión de edición (en memoria; no persistido).
7. **Preview/Probar**: reproduce el escenario con el motor de transición existente (`components/court/`, reloj único rAF, retracción de tiro saliente, `resolveHitter`). Cero lógica de animación nueva.
8. **Persistencia DB**: una sola tabla de transiciones con el escenario serializado en JSON (`CourtScenario` compatible, AC-07 del spike) + API CRUD con contratos contract-first, entrada en `lib/api-docs/spec.ts`, guards server-side y auditoría en mutaciones.

### Out of scope (explícito)

- **Cómo ven los alumnos la transición** (visor alumno, notificaciones, asignación a curso). Sólo se guarda y se previsualiza.
- **Editor para escritorio**: no se optimiza ni se garantiza layout desktop-first (debe *funcionar*, no ser el foco).
- **Poses, orientación/facing de jugadores, animaciones corporales** (decisión de producto: dirigir = destino + arco).
- **Plantillas, biblioteca pública, compartir entre profesores, clonado de transiciones ajenas**.
- **Multi-profesor / colaboración** en una misma transición.
- **Exportación a vídeo/GIF/PDF** de la transición.
- **Versionado de transiciones** (historial de revisiones): sólo `updatedAt` y `version` de concurrencia optimista si @architect lo justifica; si no, sin versionado.
- Cambios en el modelo `CourtScenario`/`Paso` existente (se consume tal cual).

## 4. Acceptance Criteria

| ID | Criterio |
|----|----------|
| AC-01 | **Mobile-first**: en viewport 375×667 el editor funciona sin scroll horizontal; todos los targets táctiles ≥44×44 px; canvas, toolbar y filmstrip visibles sin colapsar. Verificado con E2E a 375×667 y screenshot de referencia. |
| AC-02 | **Modelo compatible**: el escenario editado es serializable a `CourtScenario {id,title,initialStepIndex,steps[]}` con `Paso {id,label,positions{A,B,C,D},shot{control,to,label}\|null}` sin transformaciones ad hoc; el JSON guardado se puede pasar directo a `CourtStage`. Test unitario de round-trip `scenario → JSON → scenario`. |
| AC-03 | **Preview reutiliza el motor**: el botón "Probar" renderiza el escenario con los componentes existentes de `components/court/` (sin imports de animación nuevos ni reimplementación de rAF/easing/retracción). Verificable por revisión de imports + E2E de reproducción. |
| AC-04 | **Guard ADMIN declarado y aplicado**: la ruta del editor y todos los endpoints CRUD exigen `guardAdmin` server-side; `USER` y `TEMPORARY` → 403, `LOCKED` nunca permitido. Declarado en `lib/auth/protected-routes.ts`. Test API de guard 401/403 por endpoint. |
| AC-05 | **Persistencia DB con CRUD + auditoría + happy-path SQL**: una tabla de transiciones (escenario JSON + título + ownerId + timestamps). Endpoints `GET/POST /api/transitions` y `GET/PUT/DELETE /api/transitions/[id]` con Zod por contrato, ownership anti-IDOR (transición ajena → **404**, no 403) y `audit_logs` en create/update/delete. Cada endpoint con **≥1 happy-path en `tests/api/` que ejecute SQL real contra NeonDB**. Documentado en `lib/api-docs/spec.ts`. |
| AC-06 | **Gates del repo verdes**: unit tests (Jest) de toda lógica pura nueva (validaciones, reducers de undo/redo, serialización, normalización de coordenadas); API tests (Playwright) de guards + happy-path; **≥1 E2E navegable** del flujo crear paso → mover jugador → fijar tiro → guardar → reabrir; `tsc --noEmit` 0 errores; `eslint` 0 errores; `next build` OK; cobertura del módulo padel sin regresión >3% vs `.validation/coverage-baseline.json`; entrada en `FEATURES.md` con metadata (status/release/date/change_id/module/tags). |

## 5. Edge Cases

| ID | Caso | Comportamiento esperado |
|----|------|-------------------------|
| EC-01 | Undo con historial vacío / redo sin pila | No-op silencioso; botones deshabilitados (sin crash, sin estado inconsistente). |
| EC-02 | "Añadir paso" que resulta idéntico al anterior | Permitido, pero marcar visualmente el paso como "sin cambios" y no generar tiro si no hay `shot` definido. |
| EC-03 | Payload JSON inválido o no conforme al schema Zod | `400` con mensaje de validación; nunca `500`; nada se persiste. |
| EC-04 | Drag del jugador/pelota vs scroll de la página en móvil | El gesto sobre el canvas no debe scrollear la página; fuera del canvas el scroll es normal (touch-action acotado al canvas). |
| EC-05 | Borrar el **último** paso existente | Bloqueado con feedback (Sonner): el escenario debe conservar ≥1 paso. |
| EC-06 | Acceder/editar una transición de otro profesor (IDOR) | `404` (no `403`, no filtrar existencia). Aplica a GET/PUT/DELETE por id. |
| EC-07 | Título vacío o sólo whitespace al guardar | `400` de validación Zod; el botón guardar deshabilitado en cliente. |
| EC-08 | Guardar un escenario "vacío" (sin pasos o sin título) | Rechazado en cliente y en servidor (`400`), mismo schema compartido. |
| EC-09 | `USER` o `TEMPORARY` intentan abrir el editor o llamar la API | `403`; E2E dedicado que verifica el `403` para USER. |
| EC-10 | Tiro fijado con destino fuera de los límites de la cancha | Se clampea a los límites (X 0..10 m, Y 0..20 m) o se rechaza con feedback; nunca rompe el render. |
| EC-11 | Abandonar el editor con cambios sin guardar | Confirmación antes de salir (pérdida de cambios explícita). |
| EC-12 | Concurrencia: dos pestañas editan la misma transición | Última escritura gana (o `409` si @architect opta por `version` optimista); documentar la elección. |

## 6. Riesgos

| Riesgo | Impacto | Mitigación |
|--------|---------|------------|
| Complejidad de gestos táctiles (drag + selección + manija de arco) en Konva | Alto — UX inutilizable en móvil | Prototipo/mockup validado por @ui-designer antes de implementar; E2E a 375×667; hit-area ampliada en la manija. |
| Divergencia entre modelo del editor y `CourtScenario` | Alto — preview roto | AC-02 con test de round-trip; el editor produce el tipo existente, no uno paralelo. |
| Sobreingeniería (reducers, undo/redo, capas de abstracción) | Medio — deuda y diff grande | @ponytail-reviewer obligatorio antes de @qa-release. |
| Drag del canvas secuestra el scroll de la página | Medio | EC-04 + `touch-action` acotado + E2E móvil. |
| Endpoints nuevos sin auditoría/IDOR correcto | Medio (seguridad) | @auth-security revisa guards + auditoría; tests de guard e IDOR obligatorios. |
| Cobertura de `lib/` cae por código de UI complejo | Bajo/Medio | Extraer lógica pura a `lib/padel/` (testeable) en lugar de hooks con Konva. |

## 7. Dependencias

- **Motor existente (sin cambios de contrato)**: `components/court/` (`CourtStage`), `lib/padel/court/` (`CourtScenario`, `Paso`, `resolveHitter`), `app/(app)/puzzle-demo` como referencia.
- **DB**: `lib/db/schema.ts` + migración Drizzle generada con `pnpm run db:generate` (regla del repo: nunca SQL a mano) — **una sola tabla** de transiciones con escenario JSON.
- **API**: route handlers en `app/api/transitions/**`, Zod en `lib/validations/`, auditoría en `lib/audit/helpers.ts`, registro en `lib/auth/protected-routes.ts`, spec en `lib/api-docs/spec.ts`.
- **Librerías ya instaladas**: `konva@10.9.1`, `react-konva@19.2.7`, `vaul`, `sonner`, `zod`, `drizzle-orm`. Sin dependencias nuevas.
- **Agentes**: @db-engineer (schema + migración + queries), @auth-security (guards, auditoría, estados), @architect (contratos API + change-map), @ui-designer (mockup mobile-first), @app-engineer (editor UI + hooks + API), @ponytail-reviewer, @qa-release.

## 8. Requerimiento de Tests (detal)

**Unit (Jest, `tests/unit/`)** — `.test.ts`
- Validaciones Zod del escenario/título (válido, inválido, vacío, coords fuera de rango).
- Lógica pura del editor: undo/redo (push/undo/redo, límites), añadir/duplicar/borrar/reordenar pasos, clamp de coordenadas, derivación del `shot`.
- Serialización/round-trip `CourtScenario ↔ JSON`.
- Queries nuevas de transiciones (filtrado por ownerId) con mocks.

**API (Playwright, `tests/api/`)** — `.spec.ts`
- Guard: `401` sin sesión, `403` para `USER` y `TEMPORARY`, `200` para ADMIN, por cada endpoint.
- Happy-path con **SQL real contra NeonDB** (`-happy.spec.ts`): create → get → list → update → delete.
- IDOR: transición de otro owner → `404`.
- Validación: payload inválido → `400`.

**E2E (Playwright, `tests/e2e/`)** — mínimo 1 happy-path navegable
- Crear transición, mover un jugador, fijar tiro con arco, añadir segundo paso, undo/redo, Probar (preview), guardar, reabrir y verificar persistencia.
- Variante `403` para USER al entrar al editor.

**Gates**: `tsc --noEmit` 0 · `eslint` 0 errores · `next build` OK · unit+API+E2E verdes · cobertura sin regresión >3% · `FEATURES.md` actualizado.

## 9. Preguntas abiertas (a resolver por @architect, no bloquean el spec)

- ¿Se añade `version` (concurrencia optimista) a la tabla o "last write wins"? (EC-12)
- ¿`DELETE` es hard delete o soft (`archivedAt`)? Sugerido: coherente con el resto del repo (@db-engineer decide).
- ¿`title` obligatorio en DB o sólo validado en app?
