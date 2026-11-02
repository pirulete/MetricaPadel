# DB Plan — Editor de Transiciones (coach/ADMIN)

> change_id: 2026-11-02-coach-transition-editor
> status: implemented
> date: 2026-11-02
> module: padel
> owner: @db-engineer
> scope: chunk **C1** del `change-map.md` (schema + migración + verificación). C1b (`queries/padel/transitions.ts` + unit test) queda fuera de este pase.

---

## 1. Qué se creó

| Objeto | Tipo | Definición |
|---|---|---|
| `coach_transitions` | tabla nueva | 6 columnas, PK `id`, FK `owner_id → users.id` |
| `coach_transitions_pkey` | constraint | PK implícita sobre `id` |
| `coach_transitions_owner_id_users_id_fk` | constraint | FK `owner_id → users(id)` **ON DELETE NO ACTION** |
| `coach_transitions_owner_updated_idx` | índice btree | `(owner_id, updated_at)` |

### Columnas

| Columna | Tipo SQL | Null | Default | Notas |
|---|---|---|---|---|
| `id` | `uuid` | NO | `gen_random_uuid()` | PK |
| `owner_id` | `uuid` | NO | — | FK `users(id)` |
| `title` | `varchar(200)` | NO | — | obligatorio también en DB (EC-07/EC-08 los valida Zod antes) |
| `scenario` | `jsonb` | NO | — | sólo `{ initialStepIndex, steps }` (D-02) |
| `created_at` | `timestamp` | NO | `now()` | |
| `updated_at` | `timestamp` | NO | `now()` | lo setea la query en cada PUT; cursor G15 |

---

## 2. Por qué

- **D-01** — `ownerId` FK a `users.id` **sin cascade**: coherente con `rubrics`/`courses`; borrar un usuario no puede arrastrar material del coach silenciosamente.
- **D-02** — `scenario` guarda sólo el núcleo serializable; `id`/`title` viven en columnas (evita drift de `title` en dos sitios). `toCourtScenario(row)` reconstruye el `CourtScenario` completo (AC-02).
- **D-03** — **sin `$type<>()`** en `schema.ts`: `lib/db/schema.ts` no importa dominio (`lib/padel/court`), misma regla que `courses.days`.
- **D-04** — **hard delete**, sin `archivedAt`: la transición es material recreable, ninguna FK la referencia y `audit_logs` conserva el rastro.
- **D-05** — **sin columna `version`**: single-owner, last-write-wins con `updatedAt`.
- **Índice compuesto** — cubre exactamente `WHERE owner_id = ? ORDER BY updated_at DESC` (listado + cursor de paginación G15). Un índice sólo sobre `owner_id` obligaría a sort en memoria.

---

## 3. Convenciones seguidas (repo)

- Nombres: tabla `snake_case` plural, columnas `snake_case`, mapeo camelCase↔snake en TS (`ownerId: uuid("owner_id")`).
- Timestamps idénticos a `rubrics`/`courses`/`academies`: `timestamp(...).notNull().defaultNow()` (sin `mode`/`withTimezone`, como el resto).
- Índices con prefijo de tabla: `coach_transitions_owner_updated_idx`.
- `jsonb` (no `json`) — consistente con `courses.days` y `academy_access_requests.payload`.
- FK con `{ onDelete: "no action" }` explícito (mismo patrón que `rubrics.ownerId`).
- Añadido `coachTransitionsRelations` (owner → users) y los tipos `CoachTransition`/`NewCoachTransition` al final del archivo, siguiendo el patrón de las demás tablas.
- Migración **generada** con `pnpm run db:generate` (cero SQL a mano, `_journal.json` no editado).

---

## 4. Cambios aditivos / impacto

- **Cero cambios** en tablas existentes. Sin enums nuevos. Sin FKs entrantes.
- **Rollback**: `DROP TABLE coach_transitions` revierte sin tocar datos (la migración sólo crea la tabla, la FK y el índice).
- **Variables de entorno**: ninguna nueva.

---

## 5. Tests

**No se añaden unit tests en este pase**: el cambio es exclusivamente de schema (DDL) y no incorpora lógica de query. La cobertura de datos la aportan:
- `tests/unit/db/transitions-queries.test.ts` → chunk **C1b** (`lib/db/queries/padel/transitions.ts`, ownerId en cada query).
- `tests/api/padel/transitions-happy.spec.ts` → SQL real contra Neon/Postgres (create→get→list→update→delete).

No se inventaron queries en C1 para no invadir C1b.
