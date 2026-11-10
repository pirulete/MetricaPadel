# Migration Notes — Agenda de clases por curso

> change_id: `2026-11-04-class-agenda` · release: `v0.11` · date: `2026-11-04` · autor: @db-engineer
> Generada por `pnpm run db:generate` (**sin SQL manual**, `_journal.json` no editado a mano).

## 1. Migración

| Item | Valor |
|---|---|
| Archivo | `drizzle/0013_spotty_felicia_hardy.sql` |
| Journal idx | **13** (`0013_spotty_felicia_hardy`), último y en orden cronológico ascendente (0…13) |
| Statements | 18 |
| Snapshot | `drizzle/meta/0013_snapshot.json` (auto) |
| Base de datos aplicada | `postgresql://padel:***@localhost:5434/padel_evaluation` (contenedor `padel-evaluation-db-5434`) |
| Fecha aplicación | 2026-11-04 |

### SQL resumido (18 statements)

1. `CREATE TYPE block_enrollment_status AS ENUM('scheduled','completed','cancelled')`
2. `CREATE TYPE class_block_status AS ENUM('scheduled','completed','cancelled')`
3. `CREATE TABLE block_enrollments` (id, block_id, student_id, status, attended, notes, created_at, updated_at)
4. `CREATE TABLE class_blocks` (id, course_id, weekly_slot_id, block_date, start_time, duration_minutes, status, max_capacity, label, created_at, updated_at)
5. `CREATE TABLE weekly_slots` (id, course_id, day_of_week, start_time, duration_minutes, label, is_active, created_at, updated_at)
6–10. 5 FKs: `block_enrollments.block_id → class_blocks` **cascade**, `block_enrollments.student_id → users` **no action**, `class_blocks.course_id → courses` **cascade**, `class_blocks.weekly_slot_id → weekly_slots` **set null**, `weekly_slots.course_id → courses` **cascade**
11. `CREATE UNIQUE INDEX block_enrollments_block_student_idx (block_id, student_id)`
12. `CREATE INDEX block_enrollments_student_status_idx (student_id, status)`
13. `CREATE INDEX block_enrollments_student_attended_idx (student_id, attended)`
14. `CREATE UNIQUE INDEX class_blocks_slot_date_idx (weekly_slot_id, block_date) WHERE "weekly_slot_id" is not null`
15. `CREATE INDEX class_blocks_course_date_idx (course_id, block_date)`
16. `CREATE INDEX class_blocks_date_status_idx (block_date, status)`
17. `CREATE UNIQUE INDEX weekly_slots_course_day_time_idx (course_id, day_of_week, start_time)`
18. `CREATE INDEX weekly_slots_course_active_idx (course_id, is_active)`

Sin custom SQL (no hizo falta DO block ni data migration). Cero cambios destructivos ni de datos existentes.

## 2. Ejecución real

```
[v0] ✓ Database connection successful
[v0] 13 migrations already tracked in __drizzle_migrations
[v0] ⚠ Tables exist but migrations pending (last applied: 0012_young_betty_ross, journal: 0013_spotty_felicia_hardy)
[v0] Applying 0013_spotty_felicia_hardy (18 statements)...
[v0]   ✓ 0013_spotty_felicia_hardy applied cleanly
[v0] Migrations: 1 processed, 13 already tracked
[v0] ✓ All critical tables verified
```

## 3. Verificación post-migración (real, contra la DB)

### 3.1 Columnas (28 filas, `information_schema.columns`)

```
 block_enrollments | id, block_id, student_id, status, attended, notes, created_at, updated_at
 class_blocks      | id, course_id, weekly_slot_id, block_date, start_time, duration_minutes,
                     status, max_capacity, label, created_at, updated_at
 weekly_slots      | id, course_id, day_of_week, start_time, duration_minutes, label,
                     is_active, created_at, updated_at
```

`block_date` = `date` ✅ · `start_time` = `character varying` ✅ · `max_capacity` = `integer` (nullable) ✅ · `status` = `USER-DEFINED` (enum) ✅

### 3.2 Gate obligatorio — 4 columnas de `class_blocks`

```
 column_name
--------------
 block_date
 status
 max_capacity
 start_time
(4 rows)   ← esperado 4 ✅
```

### 3.3 Índices (11 filas incluyendo PKs)

```
 block_enrollments | block_enrollments_block_student_idx      (UNIQUE)
 block_enrollments | block_enrollments_student_attended_idx
 block_enrollments | block_enrollments_student_status_idx
 block_enrollments | block_enrollments_pkey
 class_blocks      | class_blocks_course_date_idx
 class_blocks      | class_blocks_date_status_idx
 class_blocks      | class_blocks_slot_date_idx              (UNIQUE parcial)
 class_blocks      | class_blocks_pkey
 weekly_slots      | weekly_slots_course_active_idx
 weekly_slots      | weekly_slots_course_day_time_idx        (UNIQUE)
 weekly_slots      | weekly_slots_pkey
```

Índice parcial confirmado:

```
CREATE UNIQUE INDEX class_blocks_slot_date_idx ON public.class_blocks
  USING btree (weekly_slot_id, block_date) WHERE (weekly_slot_id IS NOT NULL)
```

### 3.4 Foreign keys (5)

```
 block_enrollments_block_id_class_blocks_id_fk  | FK (block_id) REFERENCES class_blocks(id) ON DELETE CASCADE
 block_enrollments_student_id_users_id_fk       | FK (student_id) REFERENCES users(id)
 class_blocks_course_id_courses_id_fk           | FK (course_id) REFERENCES courses(id) ON DELETE CASCADE
 class_blocks_weekly_slot_id_weekly_slots_id_fk | FK (weekly_slot_id) REFERENCES weekly_slots(id) ON DELETE SET NULL
 weekly_slots_course_id_courses_id_fk           | FK (course_id) REFERENCES courses(id) ON DELETE CASCADE
```

## 4. Smoke funcional real (fixtures temporales, eliminadas después)

| Escenario | Resultado real |
|---|---|
| `materializeWeek` 1ª vez (1 slot lunes) | `{ok:true, created:1, skipped:6, activeSlots:1}` |
| `materializeWeek` 2ª vez (misma semana) | `{ok:true, created:0, skipped:7}` → **idempotencia D7 verificada** |
| `assignStudents` 1ª | `{ok:true, assigned:[…], enrolledCount:1}` |
| `assignStudents` 2ª (mismo alumno) | `{ok:true, assigned:[], alreadyAssigned:[…]}` |
| `updateAttendance({attended:true})` | enrollment → `status:'completed'`, `attended:true` |
| `setBlockStatus('cancelled')` | enrollment → `status:'cancelled'`, `cancelledStudentIds:[…]` |
| `listStudentUpcoming` tras cancelar | `[]` |
| `listStudentHistory` | 1 item + `nextCursor:null` |
| `getStudentAggregates` | conteos por status + `attendanceRate:null` con 0 marcadas |
| DB limpia post-test | `blocks_left=0`, `slots_left=0`, `enroll_left=0` |

## 5. Rollback (si hiciera falta)

`0013_*` es aditivo puro: `DROP TABLE block_enrollments, class_blocks, weekly_slots; DROP TYPE block_enrollment_status, class_block_status;` — sin pérdida de datos previos (ninguna tabla existente fue alterada).

## 6. Pendiente / fuera de este chunk

- Tests API con SQL real de la agenda ⇒ **C11a/C11b** (@app-engineer).
- Entradas de `audit_logs` (`weekly_slot`/`class_block`/`block_enrollment`) ⇒ C4/C5 (queries no auditan; lo hace el handler post-commit).
- Docs de convención `date` + `varchar(5)` y `todayInTimeZone`/`APP_TIMEZONE` en `ARCHITECTURE.md` ⇒ C13 (@qa-release).
