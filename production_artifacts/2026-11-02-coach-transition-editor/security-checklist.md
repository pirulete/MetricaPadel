# Security Checklist — Editor de Transiciones (coach/ADMIN)

> change_id: `2026-11-02-coach-transition-editor`
> date: 2026-11-02
> owner: @auth-security · ejecuta: @app-engineer (C4/C7) · verifica: @qa-release
> **Versioning**: `v1`. Revisiones → `security-checklist-v2.md`.
>
> **Leyenda**: `[x]` = **ya verificado** por @auth-security contra el código actual (hecho, no acción pendiente) · `[ ]` = **pendiente**, el implementador lo marca `[x]` solo cuando el assert pasa en runtime.
> Referencia normativa: `auth-impact.md` (§2 guards, §4 anti-IDOR, §5 auditoría, §6 huecos, §8 OWASP).

---

## 1. Hechos verificados en el repo (no requieren acción)

- [x] `guardAdmin(session)` existe en `lib/auth/admin-guard.ts:67`, **síncrono**, devuelve `NextResponse | null` (null = OK). No hay que crear guard nuevo.
- [x] `guardAdmin` exige `isAdminRole(role) && status === 'ACTIVE'` → `LOCKED` y `TEMPORARY` reciben `403`; sin `session.user.id` → `401`.
- [x] `validateAdmin()` (`lib/auth/admin-guard.ts:20`) **redirige**: sin sesión → `/login`; no-admin o `status !== 'ACTIVE'` → `/dashboard`. Es el guard de página usado por `app/(app)/rubricas/*` y `app/(app)/cursos/*`.
- [x] `app/(app)/layout.tsx` ya ejecuta `validateUser()` → `LOCKED` → `/login`, `TEMPORARY` → pantalla de verificación (el page admin nunca se alcanza).
- [x] `lib/auth/protected-routes.ts` es **solo para route handlers de API** (`'METHOD /api/…'`); **no registra páginas**. Las 3 rutas `/transiciones` **no** llevan entrada ahí (basta `validateAdmin` en el page + documentación en `auth-impact.md`).
- [x] Firmas reales de auditoría (`lib/audit/helpers.ts`): `auditCreate(entity, id, newValues, ctx)` · `auditUpdate(entity, id, oldValues, newValues, ctx)` **5 args** · `auditDelete(entity, id, oldValues, ctx)`.
- [x] `extractRequestContext(request)` → `{ ipAddress, userAgent }` (`helpers.ts:238`).
- [x] AllowedStatuses de `guardAdmin` es `ACTIVE` solo → `allowedStatuses: ['ACTIVE']` es correcto y **nunca** incluye `LOCKED`.
- [x] `paginationQuerySchema` valida `cursor` como ISO (`z.string().datetime({ offset: true })`) → no hay `Invalid Date` hacia Drizzle.
- [x] `padelIdParamsSchema` valida `id` como uuid → malformed id = `400`, nunca llega a SQL como texto arbitrario.
- [x] `auth.ts:47-50` bloquea login de `LOCKED`; `auth.ts:189-222` relee `users` y `sessions.token` en cada request (revocación de sesión y cambio de rol/estado se propagan aunque el JWT siga vivo).

---

## 2. Route handlers — `app/api/transitions/route.ts` y `app/api/transitions/[id]/route.ts`

- [ ] `export const runtime = "nodejs"` en ambos archivos.
- [ ] **Cada** handler empieza con `const session = await auth(); const guardError = guardAdmin(session); if (guardError) return guardError;` — **antes** de `request.json()`, `await params` y cualquier query. 5/5 handlers (2 en `route.ts`, 3 en `[id]/route.ts`).
- [ ] `ownerId` proviene **exclusivamente** de `session!.user.id`. Grep de control: `ownerId` no aparece en `await request.json()`, ni en `request.nextUrl.searchParams`, ni en `params`.
- [ ] Zod corre **después** del guard y **antes** de la DB: `transitionCreateSchema` (POST y PUT), `transitionListQuerySchema` (GET list), `padelIdParamsSchema` (GET/PUT/DELETE `[id]`).
- [ ] `ZodError` → `400 { error: "Datos inválidos", details }`; cualquier otro error → `500 { error: "Error interno del servidor" }` con `console.error`. Nunca se serializa el mensaje de Postgres.
- [ ] `POST` → insert con `ownerId` de sesión; responde `201 { transition }`.
- [ ] `GET /api/transitions` → `listTransitions(ownerId, { limit, cursor })` con `ownerId` **en el `WHERE` junto al `lt(updatedAt, cursor)`**; `resolveLimit`; `limit+1` → `nextCursor`; responde `200 { items, nextCursor }`.
- [ ] `GET /[id]` → query con `and(eq(id), eq(ownerId))`; `null` → `404 { error: "Transición no encontrada" }`.
- [ ] `PUT /[id]` → read previo (`getTransitionById(ownerId,id)`) → `null` → `404` (sin update, sin audit); luego `update(...).where(and(eq(id), eq(ownerId))).returning()` → vacío → `404`; setea `updatedAt: new Date()`.
- [ ] `DELETE /[id]` → `delete(...).where(and(eq(id), eq(ownerId))).returning()` → vacío → `404`; responde `200 { deleted: true, id }`.
- [ ] Recurso **ajeno** produce `404`, **nunca** `403` (no revelar existencia). El `403` se reserva al guard de rol/estado.
- [ ] Listado `stepCount`: se calcula con template `sql` usando **identificador de columna** (`COALESCE(jsonb_array_length(${coachTransitions.scenario} -> 'steps'), 0)`); sin interpolación de strings de usuario.
- [ ] Respuestas **no** incluyen `ownerId`, email ni datos del usuario; el listado **no** incluye `scenario` completo.
- [ ] Sin `Access-Control-Allow-*` nuevos, sin `dangerouslySetInnerHTML`, sin `eval`/`new Function` con datos del request.
- [ ] (Opcional P3) `content-length > 256 KB` → `413` antes de `request.json()`.

## 3. Auditoría (3 mutaciones, sin excepción)

- [ ] `POST`: `await auditCreate("coach_transition", created.id, { title, stepCount: steps.length }, { userId: session!.user.id, ...extractRequestContext(request) })` — después del insert OK, antes del `201`.
- [ ] `PUT`: `await auditUpdate("coach_transition", id, { title: old.title, stepCount: old.steps.length }, { title: new.title, stepCount: new.steps.length }, { userId: session!.user.id, ...extractRequestContext(request) })` — **5 argumentos**.
- [ ] `DELETE`: `await auditDelete("coach_transition", id, { title: deleted.title, stepCount: deleted.steps.length }, { userId: session!.user.id, ...extractRequestContext(request) })` — `oldValues` del `.returning()` del delete.
- [ ] `entityId` es el uuid real de la fila (NOT NULL en `audit_logs`).
- [ ] Sin auditoría en `400`/`403`/`404` (no hubo mutación).
- [ ] El payload **no** contiene `scenario` ni coordenadas completas.
- [ ] No se añaden wrappers a `lib/audit/helpers.ts` (se reutilizan genéricos, D-12).

## 4. `lib/auth/protected-routes.ts`

- [x] Exactamente **5 claves** bajo `// ─── PADEL EVALUATIVO — Transiciones (coach/ADMIN) ───`: `GET /api/transitions`, `POST /api/transitions`, `GET /api/transitions/[id]`, `PUT /api/transitions/[id]`, `DELETE /api/transitions/[id]`.
- [x] Cada una con `guard: 'guardAdmin'`, `allowedStatuses: ['ACTIVE']`, `roles: ['ADMIN']`, `description`.
- [x] `audit` declarado en las **3** mutaciones (`auditCreate/Update/Delete(coach_transition)`).
- [x] **Ninguna** clave para `/transiciones`, `/transiciones/nueva`, `/transiciones/[id]` (este archivo no cubre páginas).
- [x] `LOCKED` no aparece en ningún `allowedStatuses`.
- [x] `npx tsc --noEmit` sigue en 0 (el `as const` + `RouteKey` no debe romper).

## 5. Páginas (UI)

- [ ] `app/(app)/transiciones/page.tsx`, `.../nueva/page.tsx`, `.../[id]/page.tsx`: `await validateAdmin()` como primera sentencia del server component (patrón `app/(app)/rubricas/[id]/page.tsx:11`).
- [ ] Ningún componente visual decide acceso (sin `if (role === 'ADMIN')` gateando datos); el fetch va en el client component con cookies del navegador (no `fetch` server-side sin reenviar cookies → evitaría `401` silencioso o bypass accidental).
- [ ] `/[id]` con `404` de la API → `notFound()`; errores de red → estado de error, sin filtrar mensajes del servidor.
- [ ] `title` y `label` renderizados como texto (React escapa); sin `dangerouslySetInnerHTML`.
- [ ] `401`/`403`/`404` de la API se propagan como estado de UI (no se reintenta ni se oculta el fallo).

## 6. Tests de seguridad

- [ ] `tests/api/padel/transitions-guard.spec.ts` escrito con el patrón `courses-guard.spec.ts` (`serverUp()` + `test.skip` graceful + `HAS_DB` para SQL real). **Escrito en T14 (9 tests compilando, pendiente ejecución @qa-release).**
- [ ] Caso sin sesión → `401` en los 5 endpoints (sin body: el guard corre antes de Zod).
- [ ] Caso `USER` + `ACTIVE` → `403` en los 5.
- [ ] Caso `role=ADMIN` + `status=TEMPORARY` → `403` en los 5 (INSERT SQL directo: `tests/api/auth/helpers.ts:insertUser` fuerza `ACTIVE`).
- [ ] **IDOR cross-coach**: ADMIN A crea; ADMIN B recibe `404` en `GET/PUT/DELETE /[id]` y su `GET /api/transitions` **no** lista el id de A.
- [ ] uuid inexistente → `404` (mismo código que ajeno).
- [ ] `tests/e2e/transition-editor.spec.ts`: `USER` en `/transiciones` → `**/dashboard`; y `GET /api/transitions` desde su contexto → `403`.
- [ ] `tests/api/padel/transitions-happy.spec.ts` (SQL real): create → get → list → update → delete + `400` payload inválido.
- [ ] Auditoría verificable: tras `POST`/`PUT`/`DELETE`, existe fila en `audit_logs` con `entity_name='coach_transition'`, `action_type` correcto y `user_id` del coach.

## 7. Gates de cierre

- [ ] `npx tsc --noEmit` → 0 errores.
- [ ] `pnpm run lint` → 0 errores.
- [ ] `npx playwright test tests/api/padel/transitions-*.spec.ts` → verde.
- [ ] `node scripts/validate-harness.js --api-docs` → los 5 endpoints con `401/403/404` en `responses` dentro de `lib/api-docs/paths/transitions.ts` + spread en `spec.ts`.
- [ ] `--env` → **0 variables nuevas** (`.env.example` sin cambios).
- [ ] `--secrets` / `--sast` → sin hallazgos (no se añaden dependencias ni secretos).
- [ ] Cobertura de `lib/padel/` y `lib/db/queries/padel/` sin regresión >3 % vs `.validation/coverage-baseline.json`.
- [ ] `ARCHITECTURE.md` con la tabla/endpoints de transiciones (sin tocar la sección de auth); `FEATURES.md` actualizado (responsable @qa-release/@pm).

---

## 8. No-objetivos (explícitos)

- No se añade rate limit (coherente con `/api/rubrics`, `/api/courses`; solo `/api/auth/*` y endpoints públicos lo tienen).
- No se toca `auth.ts`, JWT callbacks, cookies, `NEXTAUTH_SECRET`, estados ni roles.
- No se crean guards DB-backed (no hay RBAC por academia en esta feature).
- No se introduce `version`/`409`: last-write-wins dentro del mismo `ownerId` (D-05).
