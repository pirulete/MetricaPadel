# G5 — Profile/Settings + Password Change (app-notes)

> change_id: g5-profile-settings
> module: app+api+auth
> date: 2026-09-21
> status: released

## Qué se implementó

1. **`app/api/user/password/route.ts`** (nuevo) — `PUT` con `guardUser` + check `status === "ACTIVE"` (403 si no). Valida body con `changePasswordSchema`, compara `currentPassword` contra `users.passwordHash` vía `comparePassword` (nunca lanza), hashea con bcrypt cost 10 y actualiza. Audita `auditChangePassword` con IP/UA de `extractRequestContext`. Respuestas: 200 ok, 400 contraseña actual incorrecta / zod inválido, 401 no autenticado, 403 no ACTIVE, 404 usuario inexistente.

2. **`lib/auth/schemas.ts`** — `changePasswordSchema` (currentPassword min 1, newPassword min 8, refine `current !== new` con mensaje "La nueva contraseña debe ser diferente") + tipo `ChangePasswordInput`.

3. **`app/(app)/settings/page.tsx`** (server component) — lee `auth()` + `getUserById` (phone no viaja en JWT), renderiza `ProfileForm` + `BottomNav`. El layout `(app)` ya valida sesión.

4. **`components/padel/profile-form.tsx`** (client) — dos Cards: Datos personales (email disabled/inmutable, firstName/lastName/phone → `PUT /api/user/profile`) y Cambiar contraseña (current/new/confirm → `PUT /api/user/password`, valida match client-side). Toasts sonner.

5. **`components/padel/bottom-nav.tsx`** — entrada `{ href: "/settings", label: "Perfil", icon: User }` en ADMIN_ITEMS y USER_ITEMS.

## Tests

- `tests/unit/auth/change-password.test.ts` — 5 casos del schema (pasando).
- `tests/api/padel/profile-happy.spec.ts` — happy-path SQL real: GET perfil 200, PUT perfil actualiza + verificación SQL, PUT password correcto 200 + hash bcrypt verificado, incorrecto 400, igual 400 (refine), corta 400 (zod).
- `tests/e2e/settings-profile.spec.ts` — página requiere auth, render autenticado, guards 401 de ambos endpoints.

## Notas

- El email es inmutable desde profile (regla global).
- La contraseña NUNCA se loggea ni se audita (solo el evento CHANGE_PASSWORD).
- Pre-existente (NO de G5): `lib/db/queries/padel/enrollments.ts:251` tiene un error TS `Type 'unknown' is not assignable to type 'string[]'` en `sql<string[]>` — pertenece al trabajo en curso de otra sesión (student course detail), no bloquea los archivos de G5.