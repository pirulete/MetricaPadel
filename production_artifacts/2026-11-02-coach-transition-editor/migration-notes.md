# Migration Notes — Editor de Transiciones (coach/ADMIN)

> change_id: 2026-11-02-coach-transition-editor
> date: 2026-11-02
> module: padel
> owner: @db-engineer
> status: applied & verified

---

## 1. Migración

| Campo | Valor |
|---|---|
| Archivo | `drizzle/0012_young_betty_ross.sql` |
| Snapshot | `drizzle/meta/0012_snapshot.json` |
| `_journal.json` | `idx: 12`, `tag: 0012_young_betty_ross`, `when: 1793595588829` |
| Orden cronológico | ✅ `1793595588829` > `0011 = 1791069953263` — sin huecos ni desorden |
| Generado con | `pnpm run db:generate` (**no editado a mano**) |
| Statementos | 3 (CREATE TABLE + ADD CONSTRAINT FK + CREATE INDEX) |

## 2. SQL generado (resumen)

```sql
CREATE TABLE "coach_transitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_id" uuid NOT NULL,
  "title" varchar(200) NOT NULL,
  "scenario" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
ALTER TABLE "coach_transitions"
  ADD CONSTRAINT "coach_transitions_owner_id_users_id_fk"
  FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;
CREATE INDEX "coach_transitions_owner_updated_idx"
  ON "coach_transitions" USING btree ("owner_id","updated_at");
```

## 3. Ejecución

```
DATABASE_URL="postgresql://padel:padel_dev_2026@localhost:5434/padel_evaluation?sslmode=disable" pnpm run db:migrate
```

```
[v0] ✓ Database connection successful
[v0] 12 migrations already tracked in __drizzle_migrations
[v0] ⚠ Tables exist but migrations pending (last applied: 0011_dazzling_makkari, journal: 0012_young_betty_ross)
[v0] Applying 0012_young_betty_ross (3 statements)...
[v0]   ✓ 0012_young_betty_ross applied cleanly
[v0] Migrations: 1 processed, 12 already tracked
[v0] ✓ All critical tables verified
```

## 4. Verificación real post-migración

> Regla del repo: el migrador puede reportar éxito sin ejecutar el SQL → se verificó contra `information_schema` y `pg_indexes`.

```
docker exec padel-evaluation-db-5434 psql -U padel -d padel_evaluation \
  -c "SELECT ordinal_position, column_name, data_type, is_nullable, column_default
      FROM information_schema.columns WHERE table_name='coach_transitions'
      ORDER BY ordinal_position;"
```

```
 ordinal_position | column_name |          data_type          | is_nullable |  column_default
------------------+-------------+-----------------------------+-------------+-------------------
                1 | id          | uuid                        | NO          | gen_random_uuid()
                2 | owner_id    | uuid                        | NO          |
                3 | title       | character varying           | NO          |
                4 | scenario    | jsonb                       | NO          |
                5 | created_at  | timestamp without time zone | NO          | now()
                6 | updated_at  | timestamp without time zone | NO          | now()
(6 rows)
```

```
SELECT indexname, indexdef FROM pg_indexes WHERE tablename='coach_transitions';
```

```
              indexname              |                                                    indexdef
-------------------------------------+-----------------------------------------------------------------------------------------------------------------
 coach_transitions_pkey              | CREATE UNIQUE INDEX coach_transitions_pkey ON public.coach_transitions USING btree (id)
 coach_transitions_owner_updated_idx | CREATE INDEX coach_transitions_owner_updated_idx ON public.coach_transitions USING btree (owner_id, updated_at)
(2 rows)
```

```
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='coach_transitions'::regclass;
```

```
                conname                 |            pg_get_constraintdef
----------------------------------------+----------------------------------------------
 coach_transitions_pkey                 | PRIMARY KEY (id)
 coach_transitions_owner_id_users_id_fk | FOREIGN KEY (owner_id) REFERENCES users(id)
(2 rows)
```

```
SELECT conname, confdeltype FROM pg_constraint
 WHERE conrelid='coach_transitions'::regclass AND contype='f';
```

```
                conname                 | confdeltype
----------------------------------------+-------------
 coach_transitions_owner_id_users_id_fk | a            ← NO ACTION (sin cascade, D-01)
```

**Resultado**: 6/6 columnas presentes con tipos y defaults esperados · índice compuesto `(owner_id, updated_at)` creado · FK con `NO ACTION` confirmada (`confdeltype = 'a'`).

## 5. Checklist de migraciones (AGENTS.md)

- [x] `schema.ts` es el único origen del DDL
- [x] `pnpm run db:generate` (nunca SQL a mano)
- [x] `_journal.json` **no** editado manualmente; orden cronológico verificado (`idx 12`)
- [x] `db:migrate` ejecutado sobre el Postgres local (puerto **5434**, el 5432 pertenece a otro proyecto)
- [x] `.env.local` **no** modificado
- [x] Columnas, índice y FK verificados con SQL real
- [x] `tsc --noEmit` sin errores en `lib/db/schema.ts`

## 6. Notas para C1b / próximos agentes

- `scenario` es `jsonb` **sin `$type<>()`** (D-03): el tipado del dominio vive en `lib/db/queries/padel/transitions.ts`.
- `stepCount` del listado se calcula en SQL con `jsonb_array_length(scenario->'steps')` (no se devuelve `scenario` en la lista).
- Cursor G15 = `updatedAt`; la query **debe** actualizar `updated_at` en cada PUT (no hay trigger).
- Hard delete: `DELETE` real; `audit_logs` conserva el rastro (`auditDelete("coach_transition", ...)`).
