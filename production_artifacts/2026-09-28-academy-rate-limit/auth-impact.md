# Auth Impact — Rate limiting en invitaciones de academia

> change_id: academy-invite-rate-limit
> date: 2026-09-28
> module: auth+api
> status: released

## Cambio

Rate limit por IP (10/min, ventana 60s) en `POST /api/academies/[id]/members/invite` y `POST /api/academies/[id]/members/[userId]/accept`.

## Guard server-side verificado

- **invite**: `guardAcademyAdmin(session, id)` — OWNER/ADMIN activos de la academia; 403 rol insuficiente; 404 anti-IDOR.
- **accept**: `guardUser(session)` + check self (`userId === session.user.id`); 403 si no es self; 404 si la membresía no existe/removida.
- El rate limit se evalúa **antes** del guard (al inicio del handler): un atacante sin sesión también consume presupuesto por IP, evitando abuso del propio check de auth.

## 403 en endpoints protegidos

Sin cambios — los guards existentes se mantienen intactos. Los tests de guard (`tests/api/padel/academies-guard.spec.ts`) siguen pasando (401 sin sesión, 403/404 con SQL real).

## Auditoría configurada

Sin cambios — `auditMemberInvited` (CREATE) en invite y `auditUpdate` (UPDATE) en accept se mantienen. El rate limit no audita (no es una mutación; el 429 no genera evento).

## Rate limit

| Aspecto | Valor |
|---------|-------|
| Key | `academy-invite:{ip}` (compartida entre invite y accept — límite combinado) |
| IP | `extractIP(request)` — `x-forwarded-for` (primer valor) → `x-real-ip` → `unknown` |
| Window | 60s (`ACADEMY_INVITE_WINDOW_MS`) |
| Max | 10 (`ACADEMY_INVITE_MAX`; 10000 en test env para no romper API tests — patrón `PUSH_DIRECT_MAX`) |
| Response | 429 `rateLimitedResponse` con headers `X-RateLimit-*` y `Cache-Control: no-store` |

## OWASP

- **A04 Insecure Design**: abuso de función de negocio (invitación masiva) mitigado.
- **A01 Broken Access Control (parcial)**: evita enumeración/abuso por IP en flujo de membresías.
- **A09 Security Logging (n/a)**: el 429 no requiere auditoría; los eventos de mutación ya se auditan.

## Archivos

- `lib/rate-limit.ts` — `checkPublicRateLimit(ip, options?)` + constantes academy
- `app/api/academies/[id]/members/invite/route.ts`
- `app/api/academies/[id]/members/[userId]/accept/route.ts`
- `lib/api-docs/paths/academies.ts` — 429 documentado
- `tests/unit/rate-limit.test.ts` — 10 tests