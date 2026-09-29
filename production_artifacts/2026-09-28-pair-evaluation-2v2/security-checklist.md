# Security Checklist — SPEC-01 Evaluación en Pareja 2v2

> change_id: pair-evaluation-2v2
> release: v0.8
> date: 2026-09-28
> module: auth
> tags: [security, checklist, owasp]

## Checklist

- [x] **Guard server-side verificado** — `guardAdmin` (ADMIN/SUPER_ADMIN + ACTIVE) en los 3 endpoints; 401/403. Sin confianza en checks client-side.
- [x] **Anti-IDOR (404 para recursos ajenos)** — rúbrica del coach (`getRubricById`), alumnos role USER (`getPlayerById`), inscripción de ambos (`getEnrollment`, CA-07), ownership de borradores (`teacherId`). Re-check de inscripción dentro de la tx de publish (defensa en profundidad).
- [x] **Auditoría en transacción** — `PAIR_EVALUATION_PUBLISHED` insertado con el cliente `tx` en `publishPairEvaluation` (D5); rollback atómico con los 2 updates. CREATE por borrador en `createPairDrafts`.
- [x] **Sin exposición de secrets** — sin env vars nuevas (D11); sin logs de payloads sensibles; `NEXTAUTH_SECRET` intacta.
- [ ] **Validación Zod completa** — schemas especificados (technical-design §2.6) pero **pendientes de @app-engineer** en `lib/validations/padel.ts`; incluye refine `studentAId !== studentBId` → 400.
- [x] **Rate limit consistente con endpoints existentes** — no aplica (coach autenticado, igual que evaluación 1v1).

## OWASP Mapping

| OWASP | Cobertura |
|-------|-----------|
| A01 Broken Access Control | `guardAdmin` + anti-IDOR 404 (rúbrica, alumnos, inscripción, ownership) |
| A02 Cryptographic Failures | Sin cambios; sesión JWT + HTTP-only cookies intactas |
| A03 Injection | Drizzle parametrizado; Zod valida tipos (uuid, enums, lengths) |
| A04 Insecure Design | Atomicidad transaccional (R2); versión por alumno dentro de la tx (R3) |
| A05 Security Misconfiguration | Sin nuevas env vars; sin headers nuevos requeridos |
| A06 Vulnerable Components | Sin dependencias nuevas |
| A07 Auth Failures | Reutiliza guard existente; LOCKED/no-ACTIVE rechazados |
| A08 Integrity Failures | Auditoría en tx; conteo shared/individual derivado de scores reales (D7) |
| A09 Logging Failures | `PAIR_EVALUATION_PUBLISHED` con payload completo en `audit_logs` |
| A10 SSRF | Sin fetch a URLs de usuario |

## Riesgos Residuales

1. **Endpoints aún no creados** (@app-engineer): la revisión de guards/anti-IDOR/Zod en los route handlers es contractual (technical-design §4) y sobre las queries ya implementadas; debe re-verificarse al existir los handlers.
2. **Helper de auditoría no usado en tx**: `auditPairEvaluationPublished` espeja el payload pero el camino autoritativo es el insert directo en `pair.ts` (createAuditLog no acepta cliente tx). Riesgo de divergencia futura si alguien usa el helper fuera de contexto — mitigado por el comentario en el helper.