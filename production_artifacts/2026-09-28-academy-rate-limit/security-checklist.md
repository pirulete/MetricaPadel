# Security Checklist — Rate limiting en invitaciones de academia

> change_id: academy-invite-rate-limit
> date: 2026-09-28
> module: auth+api

## Checklist

- [x] Rate limit por IP en ambos endpoints (`academy-invite:{ip}`)
- [x] Límite combinado invite+accept (accept no bypassea el límite de invite)
- [x] 429 Too Many Requests con headers `X-RateLimit-*` y `Cache-Control: no-store`
- [x] Rate limit evaluado antes del guard (protege también el check de auth)
- [x] Guards server-side intactos (`guardAcademyAdmin`, `guardUser` + self)
- [x] Auditoría intacta (`auditMemberInvited`, `auditUpdate`)
- [x] Backward compatible: `checkPublicRateLimit(ip)` sin opciones mantiene defaults (100/60s)
- [x] Test env no rompe API tests (`ACADEMY_INVITE_MAX = 10000` en test, patrón `PUSH_DIRECT_MAX`)
- [x] Unit tests: `tests/unit/rate-limit.test.ts` (10 passed)
- [x] Typecheck: `npx tsc --noEmit` limpio
- [x] Lint: 0 errores (1 warning pre-existente en `getRateLimitHeaders`)
- [x] API docs: 429 documentado en `lib/api-docs/paths/academies.ts`
- [x] FEATURES.md actualizado (change_id `academy-invite-rate-limit`)
- [x] ARCHITECTURE.md actualizado (Convenciones de Seguridad)

## Notas

- Almacenamiento en memoria (Map por instancia serverless): con ~1-2 instancias Vercel el límite efectivo es ~2× el configurado. Migrar a Vercel KV (@upstash/ratelimit) cuando crezca — mismo caveat que `checkPublicRateLimit`.
- `x-forwarded-for` puede ser spoofeable si el proxy no lo normaliza; en Vercel el header es gestionado por la plataforma (confiable).
- No se agregaron variables de entorno nuevas.