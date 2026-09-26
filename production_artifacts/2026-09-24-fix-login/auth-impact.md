# Auth Impact — Fix Login redirect (200 JSON branch)

- **change_id**: fix-login-200-json
- **date**: 2026-09-24
- **module**: auth
- **tags**: [auth, login, session, jwt, bugfix]
- **status**: reviewed

## Verdict: PASS ✅

El fix no introduce riesgos de seguridad. La navegación client-side es cosmética; el acceso real sigue gateado server-side por `validateUser`/`guardUser` + validación de sesión DB en el callback `jwt`.

## Análisis por pregunta

### 1. ¿El branch `res.ok` podría permitir bypass de autenticación? — NO
- El endpoint `/api/auth/callback/credentials` es server-side: `authorize()` valida credenciales (schema Zod, bcrypt, LOCKED check) y solo retorna 200 JSON `{ url }` cuando el usuario fue autenticado y la cookie de sesión fue seteada. Credenciales inválidas → `authorize` retorna `null` → Auth.js responde 401, no 200.
- Aunque un atacante forzara la navegación client-side a `/dashboard`, `validateUser()` (server) redirige a `/login` sin sesión válida. No hay bypass posible: el cliente no otorga acceso, solo navega.
- `redirect: "manual"` + `res.type === "opaqueredirect"` maneja el caso 302; `res.ok` cubre el caso 200 JSON. Ambos requieren cookie de sesión válida.

### 2. ¿La declaración de `sessionToken` en JWT es segura? — SÍ
- El JWT está firmado con `NEXTAUTH_SECRET` (HS256). `sessionToken` (randomUUID) no puede ser forjado ni alterado sin la secret.
- El `sessionToken` NO se expone al cliente: el callback `session()` solo mapea id/email/names/status/role/avatarUrl/requiresTermsAcceptance. No hay fuga del token de sesión DB.
- El tipo declarado en `types/next-auth.d.ts` solo elimina el `@ts-expect-error`; el runtime no cambia. La declaración es correcta y tipa el campo que ya existía en runtime.

### 3. ¿Riesgo de sesión fija / session fixation? — NO
- Cada login genera un `randomUUID()` nuevo en `validateCredentials()` e inserta una fila nueva en `sessions`. El JWT emitido referencia ese token fresco. No se reutiliza un ID controlado por el atacante.
- Logout (`/api/auth/logout`) borra la fila de `sessions` por `sessionToken`, invalidando el JWT en el siguiente request (callback `jwt` retorna `null` si la sesión DB no existe).

### 4. ¿El flujo de sesión sliding se mantiene intacto? — SÍ
- El callback `jwt` sigue: (a) refrescando datos del usuario desde DB, (b) validando `token.sessionToken` contra `sessions`, (c) retornando `null` si la sesión DB no existe (kill inmediato), (d) extendiendo `expiresAt` con TTL de `session_config` (fallback 15 min). Ninguna de estas líneas fue modificada.

## Verificación de no-regresión

| Check | Estado |
|-------|--------|
| Manejo de errores (credenciales inválidas) | ✅ `authorize` → `null` → 401 → `res.ok` false → toast.error |
| Guard de LOCKED users | ✅ `validateCredentials` retorna `null` para LOCKED (P1) + `validateUser`/`guardUser` redirigen/403 |
| Validación de sesión en JWT callback | ✅ `if (!activeSession) return null` intacto |
| Guards server-side (`validateUser`/`validateAdmin`) | ✅ Sin cambios |
| Logout con limpieza de sesión DB | ✅ Sin cambios |

## OWASP review

- **A01 Broken Access Control**: sin cambios — guards server-side intactos.
- **A02 Cryptographic Failures**: JWT firmado con secret; sin cambios.
- **A07 Identification & Authentication Failures**: sin cambios en authorize; el fix solo corrige la navegación post-login. No hay enumeración nueva (mensajes genéricos "Credenciales inválidas o cuenta bloqueada").
- **A08 Software & Data Integrity**: el JWT firmado previene manipulación de `sessionToken`.
- **Session Management (OWASP ASVS)**: cookie HTTP-only (default Auth.js), sliding window activo, invalidación server-side por DB session. Cumple.

## Observaciones menores (no bloqueantes)

1. **`skipCSRFCheck` en development**: aceptable (solo NODE_ENV=development), pero el login form usa fetch directo al callback — en producción el CSRF check sigue activo. OK.
2. **Sesiones huérfanas**: el login crea una fila nueva en `sessions` por login; sesiones antiguas del mismo usuario en otros dispositivos no se invalidan (comportamiento documentado en logout). No es un riesgo nuevo introducido por este fix.
3. **Recomendación**: considerar un test API que verifique que `/api/auth/callback/credentials` con `redirect:false` retorna 200 + cookie para credenciales válidas y 401 para inválidas/LOCKED, para fijar el contrato que este fix depende.

## Archivos revisados

- `app/(public)/login/page.tsx` — branch `res.ok` (líneas 54-60)
- `types/next-auth.d.ts` — `sessionToken` en User y JWT
- `auth.ts` — remoción de `@ts-expect-error` (línea 182)
- `lib/auth/admin-guard.ts` — verificación de guards (sin cambios)
- `app/api/auth/logout/route.ts` — verificación de limpieza de sesión (sin cambios)